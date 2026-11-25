// Stockfish, the chess engine the computer plays with: its single-threaded WebAssembly build from
// the `stockfish` package (GPL-3.0), run as child processes that speak UCI over their stdin and
// stdout. Being their own processes, a search never holds up the bot's other games. One process
// searches one position at a time, in the order asked; it's started on its first search, and
// again after it dies or a search runs over its time. A pool of them, one per CPU up to
// `MAX_PROCESSES`, shares the searches out, so games against the computer at once don't all wait
// on one process.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { availableParallelism } from "node:os";
import { createInterface } from "node:readline";

/** How hard the computer tries at each level: Stockfish's Skill Level, and how deep and long */
export type LevelSearch = { skill: number; depth: number; movetimeMs: number };

/**
 * The computer's levels, from 1, which a beginner can beat, to 8, as strong as it plays here.
 * Below 20, Stockfish's Skill Level picks a weaker move from its best few, the lower the weaker;
 * the depth and time cap how far it looks.
 */
export const LEVELS: Record<number, LevelSearch> = {
    1: { skill: 0, depth: 1, movetimeMs: 50 },
    2: { skill: 1, depth: 2, movetimeMs: 100 },
    3: { skill: 3, depth: 3, movetimeMs: 150 },
    4: { skill: 5, depth: 5, movetimeMs: 200 },
    5: { skill: 8, depth: 7, movetimeMs: 300 },
    6: { skill: 11, depth: 10, movetimeMs: 400 },
    7: { skill: 15, depth: 14, movetimeMs: 600 },
    8: { skill: 20, depth: 22, movetimeMs: 1000 },
};

/** What searches for the computer's move: Stockfish, or a stand-in in a test */
export interface Engine {
    /**
     * The best move at the level in the position, as UCI, eg. "e7e5", searching no longer than
     * the level's time or `maxMs`, if that's shorter
     */
    bestMove(fen: string, level: number, maxMs?: number): Promise<string>;
}

/** The most Stockfish processes the pool runs */
export const MAX_PROCESSES = 4;

/** The shortest search asked for, however short of time the computer is */
const MIN_MOVETIME_MS = 10;

/** How long past its time a search can run before the process is thought stuck */
const SLACK_MS = 10_000;

/** How long the engine has to start, loading its WebAssembly */
const START_MS = 30_000;

type Waiter = {
    match: (line: string) => string | undefined;
    resolve: (value: string) => void;
    reject: (err: Error) => void;
};

/** The package's single-threaded lite build, which the bot runs */
const STOCKFISH_PATH = () => require.resolve("stockfish/bin/stockfish-19-lite-single.js");

/** Stockfish processes, each search going to the one with the fewest to do */
export class StockfishPool implements Engine {
    readonly #engines: StockfishEngine[];

    constructor(size = Math.min(MAX_PROCESSES, availableParallelism()), path = STOCKFISH_PATH()) {
        this.#engines = Array.from({ length: Math.max(1, size) }, () => new StockfishEngine(path));
    }

    bestMove(fen: string, level: number, maxMs?: number): Promise<string> {
        const engine = this.#engines.reduce((a, b) => (b.pending < a.pending ? b : a));
        return engine.bestMove(fen, level, maxMs);
    }

    /** Stops every process */
    stop(): void {
        for (const engine of this.#engines) engine.stop();
    }
}

/** One Stockfish process */
export class StockfishEngine implements Engine {
    readonly #path: string;
    #process?: ChildProcessWithoutNullStreams;
    #ready?: Promise<void>;
    #waiter?: Waiter;
    /** The searches asked for, one after another */
    #queue: Promise<unknown> = Promise.resolve();
    #pending = 0;

    /** `path` is the engine's script, by default the package's single-threaded lite build */
    constructor(path = STOCKFISH_PATH()) {
        this.#path = path;
    }

    /** How many searches are asked for and not yet answered */
    get pending(): number {
        return this.#pending;
    }

    bestMove(fen: string, level: number, maxMs?: number): Promise<string> {
        const search = LEVELS[level];
        if (search === undefined) return Promise.reject(new Error(`There's no level ${level}`));
        const movetimeMs = Math.max(
            MIN_MOVETIME_MS,
            Math.floor(Math.min(search.movetimeMs, maxMs ?? Infinity)),
        );
        this.#pending++;
        const result = this.#queue
            .then(() => this.#search(fen, { ...search, movetimeMs }))
            .finally(() => this.#pending--);
        this.#queue = result.catch(() => undefined);
        return result;
    }

    /** Stops the process, eg. as the bot stops, failing the search it's on */
    stop(): void {
        const child = this.#process;
        this.#reset();
        child?.kill();
    }

    async #search(fen: string, { skill, depth, movetimeMs }: LevelSearch): Promise<string> {
        await this.#start();
        this.#send(`setoption name Skill Level value ${skill}`);
        this.#send(`position fen ${fen}`);
        const best = this.#await(
            (line) => /^bestmove (\S+)/.exec(line)?.[1],
            movetimeMs + SLACK_MS,
        );
        this.#send(`go depth ${depth} movetime ${movetimeMs}`);
        const move = await best;
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
            throw new Error(`Stockfish answered "${move}"`);
        }
        return move;
    }

    #start(): Promise<void> {
        if (this.#ready !== undefined) return this.#ready;
        const child = spawn(process.execPath, [this.#path], { stdio: "pipe" });
        this.#process = child;
        createInterface({ input: child.stdout }).on("line", (line) => {
            // A process that's been replaced may still be printing, eg. a stuck search's answer,
            // which isn't for the search that's waiting now
            if (this.#process !== child) return;
            const waiter = this.#waiter;
            const value = waiter?.match(line.trim());
            if (waiter !== undefined && value !== undefined) {
                this.#waiter = undefined;
                waiter.resolve(value);
            }
        });
        child.stderr.on("data", () => undefined);
        child.on("exit", () => {
            if (this.#process === child) this.#reset();
        });
        child.stdin.on("error", () => undefined);
        child.on("error", (err) => {
            console.error("Stockfish failed:", err);
            if (this.#process === child) this.#reset();
        });
        this.#ready = (async () => {
            const uciok = this.#await((line) => (line === "uciok" ? line : undefined), START_MS);
            this.#send("uci");
            await uciok;
            const ready = this.#await((line) => (line === "readyok" ? line : undefined), START_MS);
            this.#send("isready");
            await ready;
        })();
        this.#ready.catch(() => this.stop());
        return this.#ready;
    }

    // The value `match` finds in the first line it finds one in, or an error after `ms`, when
    // the process is stopped, as it may be stuck
    #await(match: (line: string) => string | undefined, ms: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#waiter = undefined;
                reject(new Error("Stockfish took too long"));
                this.stop();
            }, ms);
            this.#waiter = {
                match,
                resolve: (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            };
        });
    }

    #send(command: string): void {
        this.#process?.stdin.write(`${command}\n`);
    }

    // Forgets the process, failing whatever was waiting on it
    #reset(): void {
        const waiter = this.#waiter;
        this.#process = undefined;
        this.#ready = undefined;
        this.#waiter = undefined;
        waiter?.reject(new Error("Stockfish stopped"));
    }
}
