// The maze race: up to ten racers, each with their own dot, in the same maze. The first out wins,
// or, when the time's up, whoever's closest to the way out. Moves come live, over the socket
// (`live.ts`), and every change goes straight back to every racer, so everyone sees everyone move.
// Each move is checked against the maze's walls here, as the page's own prediction of it isn't
// trusted. The maze is carved from a seed chosen at the start (`maze.ts`).
import type { ConfigureResult, Game, Host, LiveResult } from "../game";
import { duration } from "../race2048/race";
import { defaultSettings, type Settings } from "../settings";
import { canMove, carve, DIRECTIONS, isDirection, isWayOut, stepsOut, type Maze } from "./maze";
import { MAZE_SETTINGS } from "./settings";
import {
    GAME_ID,
    MAX_PLAYERS,
    STATE_VERSION,
    type Ending,
    type Phase,
    type Seat,
    type SharedState,
} from "./types";

export type Racer = Seat & { x: number; y: number; ack: number; moves: number };

const refused = (error: string): LiveResult => ({ ok: false, error, changed: false });

export type MazeData = {
    phase: Phase;
    /** Who's joined, before the start */
    seats: Seat[];
    /** Everyone racing, once it starts, in the order they joined */
    players: Racer[];
    /** The `seq` of the last state published through the service */
    seq: number;
    /** Goes up with every change, so the page can tell the newer of two states */
    rev: number;
    createdAt: number;
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    seed?: number;
    ended?: Ending;
    winner?: string;
    settings?: Settings;
    host?: string;
    hostName?: string;
};

export type MazeOptions = {
    random?: () => number;
    now?: () => number;
    settings?: Settings;
    host?: Host;
};

/**
 * How often the race's state goes through the service, which spectators see it by, at most every
 * 250 ms anyway. Racers get each change at once over the socket.
 */
const PUBLISH_MS = 250;

export class MazeRace implements Game {
    readonly kind = GAME_ID;
    readonly #data: MazeData;
    readonly #random: () => number;
    readonly #now: () => number;
    #maze?: Maze;

    constructor(data: MazeData, options: MazeOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: MazeOptions = {}): MazeRace {
        const now = options.now ?? Date.now;
        return new MazeRace(
            {
                phase: "open",
                seats: [],
                players: [],
                seq: 0,
                rev: 0,
                createdAt: now(),
                settings: options.settings,
                host: options.host?.id,
                hostName: options.host?.name,
            },
            options,
        );
    }

    get data(): MazeData {
        return this.#data;
    }

    get phase(): Phase {
        return this.#data.phase;
    }

    get createdAt(): number {
        return this.#data.createdAt;
    }

    get finishedAt(): number | undefined {
        return this.#data.finishedAt;
    }

    get size(): number {
        return this.settings().size;
    }

    /** The maze, once the race has started */
    get maze(): Maze | undefined {
        if (this.#maze === undefined && this.#data.seed !== undefined) {
            this.#maze = carve(this.size, this.#data.seed);
        }
        return this.#maze;
    }

    isSeated(userId: string): boolean {
        return (
            this.#data.seats.some((s) => s.id === userId) ||
            this.#data.players.some((p) => p.id === userId)
        );
    }

    isPlayer(userId: string): boolean {
        return this.#data.players.some((p) => p.id === userId);
    }

    join(userId: string, name: string): string | undefined {
        if (this.#data.phase !== "open") return "The race has started";
        if (this.isSeated(userId)) return undefined;
        if (this.#data.seats.length >= MAX_PLAYERS) return `All ${MAX_PLAYERS} places are taken`;
        this.#data.seats.push({ id: userId, name });
        this.#changed();
        return undefined;
    }

    /** Frees the seat before the start; a racer who leaves after it stays where they got to */
    leave(userId: string): boolean {
        if (this.#data.phase !== "open") return false;
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        if (this.#data.seats.length === before) return false;
        this.#changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(MAZE_SETTINGS), ...this.#data.settings };
    }

    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#data.phase !== "open") return { ok: false, error: "The race has started" };
        if (userId !== this.#data.host) {
            return { ok: false, error: "Only the host can change the settings" };
        }
        this.#data.settings = { ...this.#data.settings, ...settings };
        this.#changed();
        return { ok: true };
    }

    cannotStart(): string | undefined {
        if (this.#data.phase !== "open") return undefined;
        return this.#data.seats.length === 0 ? "Nobody has joined yet" : undefined;
    }

    /** Starts everyone seated in the top-left cell of a maze carved from a new seed */
    start(): string[] {
        const d = this.#data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.#now();
            d.players = d.seats.map((s) => ({ ...s, x: 0, y: 0, ack: 0, moves: 0 }));
            d.seats = [];
            d.seed = Math.floor(this.#random() * 2 ** 31);
            d.phase = "active";
            d.startedAt = now;
            d.endsAt = now + this.settings().minutes * 60_000;
            this.#changed();
        }
        return d.players.map((p) => p.id);
    }

    /** Everyone races at once */
    waitingFor(): string[] {
        return [];
    }

    /** Ends the race when the time's up: whoever's closest to the way out wins */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || this.#now() < d.endsAt) return false;
        const maze = this.maze!;
        // Closest first, then the fewest moves, then whoever joined first
        const ranked = [...d.players].sort(
            (a, b) => stepsOut(maze, a.x, a.y) - stepsOut(maze, b.x, b.y) || a.moves - b.moves,
        );
        this.#finish("time", ranked[0]?.id, d.endsAt);
        return true;
    }

    /** The bot was down: the race's clock doesn't run meanwhile */
    resume(downMs: number): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || downMs <= 0) return false;
        d.endsAt += downMs;
        this.#changed();
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /**
     * A racer's move, `{ move: "left", n: 7 }`, where `n` counts their moves from 1. A move the
     * bot's had already, eg. sent again after a reconnect, changes nothing; one into a wall is
     * refused, but still counted as taken, so the racer's page drops it.
     */
    receive(userId: string, message: unknown): LiveResult {
        const d = this.#data;
        if (d.phase === "open") return refused("The race hasn't started");
        if (d.phase === "finished") return refused("The race is over");
        const racer = d.players.find((p) => p.id === userId);
        if (racer === undefined) return refused("You aren't in this race");
        const { move, n } = (message ?? {}) as Partial<{ move: unknown; n: unknown }>;
        if (!isDirection(move) || typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) {
            return refused("A move is a direction and its number");
        }
        if (n <= racer.ack) return { ok: true, changed: false };
        racer.ack = n;
        const maze = this.maze!;
        if (!canMove(maze, racer.x, racer.y, move)) {
            this.#changed();
            return { ok: false, error: "There's a wall that way", changed: true };
        }
        racer.x += DIRECTIONS[move].dx;
        racer.y += DIRECTIONS[move].dy;
        racer.moves++;
        if (isWayOut(maze, racer.x, racer.y)) {
            this.#finish("out", racer.id, this.#now());
        } else {
            this.#changed();
        }
        return { ok: true, changed: true };
    }

    #finish(ended: Ending, winner: string | undefined, at: number): void {
        const d = this.#data;
        d.phase = "finished";
        d.ended = ended;
        d.winner = winner;
        d.finishedAt = at;
        this.#changed();
    }

    #changed(): void {
        this.#data.rev++;
    }

    shared(): SharedState {
        const d = this.#data;
        const names: Record<string, string> = {};
        for (const p of [...d.seats, ...d.players]) names[p.id] = p.name;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            phase: d.phase,
            settings: this.settings(),
            host: d.host,
            hostName: d.hostName,
            seats: d.seats.map((s) => ({ ...s })),
            names,
            size: this.size,
            seed: d.seed,
            racers: d.players.map(({ id, x, y, ack, moves }) => ({ id, x, y, ack, moves })),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) got out in 1m 12s", or "Time's
     * up! @UserId(abc) got closest to the way out", the winner a mention so the card shows their
     * username as it is now
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        if (d.winner === undefined) return "The race ended with nobody in it";
        const who = `@UserId(${d.winner})`;
        if (d.ended === "out" && d.startedAt !== undefined && d.finishedAt !== undefined) {
            return `${who} got out in ${duration(d.finishedAt - d.startedAt)}`;
        }
        return `Time's up! ${who} got closest to the way out`;
    }

    /** How the race ended is its final state: the maze's seed, and where everyone got to */
    endState(): SharedState | undefined {
        return this.#data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): MazeData {
        return this.#data;
    }
}
