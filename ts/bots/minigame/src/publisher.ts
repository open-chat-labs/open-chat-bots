// Publishes each game's state to the MiniApp service, which relays it to everyone with the game
// open. Moves come fast, so the states are coalesced: a change schedules one update shortly, and a
// change during an update schedules the next one after it, so updates go one at a time per game
// and their `seq`s go up in order. Nothing waits on a publish: a request handler marks the game
// changed and answers.
import {
    MiniAppServiceError,
    miniAppGameKey,
    type MiniAppGame,
    type MiniAppGameUpdate,
    type MiniAppServiceClient,
} from "@open-ic/openchat-botclient-ts";
import { jsonBytes, MAX_END_STATE_BYTES } from "./games/game";
import type { GameStore } from "./store";

type Pending = { timer?: NodeJS.Timeout; inFlight: boolean; again: boolean; retries: number };

const DELAY_MS = 80;
const RETRY_MS = 2000;
const MAX_RETRIES = 5;

export class Publisher {
    readonly #pending = new Map<string, Pending>();

    /** `delayMs` overrides every game's own pace, eg. 0 in a test */
    constructor(
        private readonly miniApps: () => MiniAppServiceClient | undefined,
        private readonly store: GameStore,
        private readonly delayMs?: number,
    ) {}

    /** Sends the game's latest state shortly. When it's finished, that ends the card too. */
    publish(game: MiniAppGame): void {
        const key = miniAppGameKey(game);
        const pending = this.#pending.get(key) ?? { inFlight: false, again: false, retries: 0 };
        this.#pending.set(key, pending);
        if (pending.inFlight) {
            pending.again = true;
            return;
        }
        if (pending.timer === undefined) {
            const delay = this.delayMs ?? this.store.get(game)?.play.publishEveryMs() ?? DELAY_MS;
            pending.timer = setTimeout(() => {
                pending.timer = undefined;
                void this.#flush(game, pending);
            }, delay);
        }
    }

    /**
     * Sends every unfinished game's state as the bot starts: a chess clock has skipped the time
     * the bot was down, so everyone needs the new deadline, and a page from a new release can't
     * read a state from the last one, so it waits for this. A finished game has nothing to send.
     */
    publishUnfinished(): void {
        for (const { game, play } of this.store.entries()) {
            if (play.phase !== "finished") this.publish(game);
        }
    }

    async #flush(game: MiniAppGame, pending: Pending): Promise<void> {
        const entry = this.store.get(game);
        const client = this.miniApps();
        if (entry === undefined || client === undefined) {
            if (client === undefined) {
                console.warn("No MiniApp service client yet, so the game's state wasn't published");
            }
            this.#pending.delete(miniAppGameKey(game));
            return;
        }
        pending.inFlight = true;
        pending.again = false;
        const { play } = entry;
        const update: MiniAppGameUpdate = {
            game,
            state: { seq: play.nextSeq(), shared: play.shared() },
        };
        if (play.phase === "finished") {
            update.status = "finished";
            update.result = play.result();
            // How the game ended, if the game has it to give: OpenChat writes it to the card and
            // hands it to the app, which shows the finished game from it. The service takes so
            // much of it; over that, the card shows the image and the result instead.
            const endState = play.endState();
            if (endState !== undefined) {
                const bytes = jsonBytes(endState);
                if (bytes <= MAX_END_STATE_BYTES) {
                    update.endState = endState;
                } else {
                    console.warn(
                        `The end state of ${miniAppGameKey(game)} is ${bytes} bytes, over the ${MAX_END_STATE_BYTES} the service takes, so none was sent`,
                    );
                }
            }
        } else {
            // Whose turn it is, for the card, when the game has turns: the states go one at a time
            // per game, in order, so the latest is never put back by an earlier one
            const waitingFor = play.waitingFor();
            if (waitingFor.length > 0) update.waitingFor = waitingFor;
        }
        this.store.save();
        let retry = false;
        try {
            await client.update(update);
            pending.retries = 0;
        } catch (err) {
            if (err instanceof MiniAppServiceError) {
                // The game may not be posted yet, or the service may be down: try again shortly
                retry = err.kind === "unavailable" || err.kind === "unknown_game";
                if (err.kind === "finished") {
                    console.warn(`The service says the game ${miniAppGameKey(game)} is finished`);
                }
            }
            console.error(`Couldn't publish ${miniAppGameKey(game)}:`, err);
        }
        pending.inFlight = false;
        if (pending.again) {
            this.publish(game);
        } else if (retry && pending.retries < MAX_RETRIES) {
            pending.retries++;
            pending.timer = setTimeout(() => {
                pending.timer = undefined;
                void this.#flush(game, pending);
            }, RETRY_MS);
        } else {
            this.#pending.delete(miniAppGameKey(game));
        }
    }
}
