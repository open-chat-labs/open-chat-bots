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
import type { GameStore } from "./store";

type Pending = { timer?: NodeJS.Timeout; inFlight: boolean; again: boolean; retries: number };

const DELAY_MS = 80;
const RETRY_MS = 2000;
const MAX_RETRIES = 5;

export class Publisher {
    readonly #pending = new Map<string, Pending>();

    constructor(
        private readonly miniApps: () => MiniAppServiceClient | undefined,
        private readonly store: GameStore,
        private readonly delayMs: number = DELAY_MS,
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
            pending.timer = setTimeout(() => {
                pending.timer = undefined;
                void this.#flush(game, pending);
            }, this.delayMs);
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
        const { race } = entry;
        const shared = race.shared();
        const update: MiniAppGameUpdate = {
            game,
            state: { seq: race.nextSeq(), shared },
        };
        if (race.phase === "finished") {
            update.status = "finished";
            update.result = race.result();
            // The final shared state, with every board, the winner and the times, is how the race
            // ended: OpenChat writes it to the card and hands it to the app, which shows the finished
            // race from it. It's a few KB at most, well within the end state's 16 KB.
            update.endState = shared;
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
