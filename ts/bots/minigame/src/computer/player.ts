// The computer's side of a game: when it's the computer's move, the engine searches the position,
// and the move it finds is played and published, unless the position's moved on meanwhile, eg. as
// the human resigned. One search per game at a time. A request that changes a game asks straight
// away (`poke`), and the sweep asks for every game each second (`pokeAll`), so a game loaded as the
// bot starts, or whose search failed, is picked up. The computer's clock runs while it thinks, so
// a search gets a share of the time it has left, `1 / MOVES_TO_BUDGET`, at most. A reply comes no
// sooner than `minDelayMs` after the human's move, so the computer seems to think, and the human
// sees their own move land, unless that share is shorter. If the engine fails, the computer plays
// a legal move at random rather than lose on time.
import { miniAppGameKey, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { Chess } from "chess.js";
import type { Publisher } from "../publisher";
import type { GameStore } from "../store";
import type { Engine } from "./engine";

/** How long the computer seems to think, at least, when it has the time */
export const MIN_DELAY_MS = 700;

/** How many more moves the computer budgets its time left for */
export const MOVES_TO_BUDGET = 40;

export class ComputerPlayer {
    readonly #engine: Engine;
    readonly #store: GameStore;
    readonly #publisher: Publisher;
    readonly #minDelayMs: number;
    readonly #random: () => number;
    /** The games being searched, by key */
    readonly #thinking = new Set<string>();

    constructor(
        engine: Engine,
        store: GameStore,
        publisher: Publisher,
        options: { minDelayMs?: number; random?: () => number } = {},
    ) {
        this.#engine = engine;
        this.#store = store;
        this.#publisher = publisher;
        this.#minDelayMs = options.minDelayMs ?? MIN_DELAY_MS;
        this.#random = options.random ?? Math.random;
    }

    /** Whether a search is under way for the game */
    isThinking(game: MiniAppGame): boolean {
        return this.#thinking.has(miniAppGameKey(game));
    }

    /** Finds and plays the computer's move in the game, if it's the computer's move */
    poke(game: MiniAppGame): Promise<void> {
        const key = miniAppGameKey(game);
        const turn = this.#store.get(game)?.play.computerTurn?.();
        if (turn === undefined || this.#thinking.has(key)) return Promise.resolve();
        this.#thinking.add(key);
        const started = Date.now();
        const budgetMs = turn.timeLeftMs / MOVES_TO_BUDGET;
        return (async () => {
            let move: string;
            try {
                move = await this.#engine.bestMove(turn.fen, turn.level, budgetMs);
            } catch (err) {
                console.error("The engine couldn't find the computer's move:", err);
                move = this.#anyMove(turn.fen);
            }
            const wait = Math.min(this.#minDelayMs, budgetMs) - (Date.now() - started);
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            const entry = this.#store.get(game);
            if (entry?.play.playComputer?.(turn.ply, move) === true) {
                this.#store.save();
                this.#publisher.publish(game);
            }
        })()
            .catch((err) => console.error("The computer couldn't move:", err))
            .finally(() => this.#thinking.delete(key));
    }

    /** Pokes every game */
    pokeAll(): void {
        for (const { game, play } of this.#store.entries()) {
            if (play.computerTurn !== undefined) void this.poke(game);
        }
    }

    // A legal move at random, as UCI
    #anyMove(fen: string): string {
        const moves = new Chess(fen).moves({ verbose: true });
        const move = moves[Math.floor(this.#random() * moves.length)];
        return `${move.from}${move.to}${move.promotion ?? ""}`;
    }
}
