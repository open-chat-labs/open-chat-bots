// ChatMan: up to ten players, each with their own board, in the same mazes with the same spam bots,
// all at once. The top score wins when the time's up, or when everyone's out of lives. Each page
// plays its own board at once, and sends its turns live, over the socket (`live.ts`), each with the
// tick it was taken at. The bot doesn't take the page's word for anything: it plays every board
// itself, with the same rules (`rules.ts`), a little behind the game's clock, taking each turn at
// its tick, so a turn has that long to arrive. One that's later is taken as soon as the bot can, and
// the page puts its board where the bot has it. The mazes are built from a seed chosen at the start.
import type { ConfigureResult, Game, Host, LiveResult } from "../game";
import { isDirection } from "../maze/maze";
import { defaultSettings, type Settings } from "../settings";
import { Mazes, newBoard, pack, play, TICK_MS, TICKS_PER_SECOND, unpack, type Board, type PackedBoard, type Turn } from "./rules";
import { CHATMAN_SETTINGS } from "./settings";
import {
    AHEAD_TICKS,
    COUNTDOWN_MS,
    DIRECTION_NUMBERS,
    GAME_ID,
    LAG_TICKS,
    MAX_PLAYERS,
    MAX_QUEUE,
    STATE_VERSION,
    type Ending,
    type Phase,
    type Seat,
    type SharedState,
} from "./types";

export type ChatPlayer = Seat & {
    /** Their board as far as the bot has played it */
    board: PackedBoard;
    /** Their turns the bot has had but not reached, in order */
    queue: Turn[];
    /** The number of their last turn the bot has had */
    ack: number;
};

export type ChatManData = {
    phase: Phase;
    /** Who's joined, before the start */
    seats: Seat[];
    /** Everyone playing, once it starts, in the order they joined */
    players: ChatPlayer[];
    /** The `seq` of the last state published through the service */
    seq: number;
    /** Goes up with every change, so the page can tell the newer of two states */
    rev: number;
    createdAt: number;
    startedAt?: number;
    playsAt?: number;
    endsAt?: number;
    finishedAt?: number;
    seed?: number;
    ended?: Ending;
    winner?: string;
    settings?: Settings;
    host?: string;
    hostName?: string;
};

export type ChatManOptions = {
    random?: () => number;
    now?: () => number;
    settings?: Settings;
    host?: Host;
};

/**
 * How often the game's state goes through the service, which spectators see it by, at most every
 * 250 ms anyway, and over the socket: every board moves all the time, and each page plays them on
 * between states, so a turn needn't go out the moment it comes in
 */
const PUBLISH_MS = 250;
const LIVE_MS = 100;

const refused = (error: string): LiveResult => ({ ok: false, error, changed: true });

export class ChatManRace implements Game {
    readonly kind = GAME_ID;
    readonly #data: ChatManData;
    readonly #random: () => number;
    readonly #now: () => number;
    #mazes?: Mazes;
    /** Each player's board, unpacked, as it's played on */
    readonly #boards = new Map<string, Board>();
    /** Whether the boards have moved on since `tick` last said so */
    #moved = false;

    constructor(data: ChatManData, options: ChatManOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: ChatManOptions = {}): ChatManRace {
        const now = options.now ?? Date.now;
        return new ChatManRace(
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

    get data(): ChatManData {
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

    /** The mazes, once the game has started */
    get mazes(): Mazes | undefined {
        if (this.#mazes === undefined && this.#data.seed !== undefined) {
            this.#mazes = new Mazes(this.#data.seed);
        }
        return this.#mazes;
    }

    /** The tick the game ends on */
    get lastTick(): number {
        return this.settings().minutes * 60 * TICKS_PER_SECOND;
    }

    /** A player's board as the bot has it */
    board(userId: string): Board | undefined {
        const player = this.#data.players.find((p) => p.id === userId);
        return player === undefined ? undefined : this.#board(player);
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
        if (this.#data.phase !== "open") return "The game has started";
        if (this.isSeated(userId)) return undefined;
        if (this.#data.seats.length >= MAX_PLAYERS) return `All ${MAX_PLAYERS} places are taken`;
        this.#data.seats.push({ id: userId, name });
        this.#changed();
        return undefined;
    }

    /** Frees the seat before the start; a player who leaves after it plays on without turning */
    leave(userId: string): boolean {
        if (this.#data.phase !== "open") return false;
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        if (this.#data.seats.length === before) return false;
        this.#changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(CHATMAN_SETTINGS), ...this.#data.settings };
    }

    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#data.phase !== "open") return { ok: false, error: "The game has started" };
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

    /** Gives everyone seated the same new board, in mazes from a new seed, after a countdown */
    start(): string[] {
        const d = this.#data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.#now();
            d.seed = Math.floor(this.#random() * 2 ** 31);
            const first = this.mazes!.level(1);
            const board = pack(newBoard(d.seed, this.settings().lives), first);
            d.players = d.seats.map((s) => ({ ...s, board: { ...board }, queue: [], ack: 0 }));
            d.seats = [];
            d.phase = "active";
            d.startedAt = now;
            d.playsAt = now + COUNTDOWN_MS;
            d.endsAt = d.playsAt + this.settings().minutes * 60_000;
            this.#changed();
        }
        return d.players.map((p) => p.id);
    }

    /** Everyone plays at once */
    waitingFor(): string[] {
        return [];
    }

    /**
     * Ends the game once the time's up, and the turns on their way have had time to arrive, or
     * once everyone's out of lives: the top score wins
     */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined) return false;
        const now = this.#now();
        this.#advance(now);
        if (now >= d.endsAt + LAG_TICKS * TICK_MS) {
            this.#finish("time", d.endsAt);
            return true;
        }
        if (d.players.every((p) => this.#board(p).out)) {
            this.#finish("out", now);
            return true;
        }
        return false;
    }

    /** Plays the boards on to now, and says whether they've moved since this was last called */
    tick(): boolean {
        this.#advance(this.#now());
        const moved = this.#moved;
        this.#moved = false;
        return moved;
    }

    /** The bot was down: the game's clock doesn't run meanwhile */
    resume(downMs: number): boolean {
        const d = this.#data;
        if (d.phase !== "active" || downMs <= 0) return false;
        for (const key of ["startedAt", "playsAt", "endsAt"] as const) {
            if (d[key] !== undefined) d[key] += downMs;
        }
        this.#changed();
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_MS;
    }

    liveEveryMs(): number {
        return LIVE_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /**
     * A player's turn, `{ turn: "left", n: 7, tick: 1234 }`, where `n` counts their turns from 1
     * and `tick` is when they took it. A turn the bot's had already, eg. sent again after a
     * reconnect, changes nothing. One it refuses is still counted as had, so the page drops it.
     */
    receive(userId: string, message: unknown): LiveResult {
        const d = this.#data;
        if (d.phase === "open") return { ...refused("The game hasn't started"), changed: false };
        if (d.phase === "finished") return { ...refused("The game is over"), changed: false };
        const player = d.players.find((p) => p.id === userId);
        if (player === undefined) return { ...refused("You aren't in this game"), changed: false };
        const { turn, n, tick } = (message ?? {}) as Partial<Record<"turn" | "n" | "tick", unknown>>;
        if (
            !isDirection(turn) ||
            typeof n !== "number" ||
            !Number.isSafeInteger(n) ||
            n < 1 ||
            typeof tick !== "number" ||
            !Number.isSafeInteger(tick) ||
            tick < 0
        ) {
            return { ...refused("A turn is a way, its number and its tick"), changed: false };
        }
        if (n <= player.ack) return { ok: true, changed: false };
        player.ack = n;
        this.#changed();
        const now = this.#now();
        this.#advance(now);
        const board = this.#board(player);
        if (board.out) return refused("You're out of lives");
        if (tick > this.#tickAt(now) + AHEAD_TICKS) return refused("That turn is ahead of the game");
        if (player.queue.length >= MAX_QUEUE) return refused("Too many turns at once");
        // Taken at its tick, unless that's gone by, or is before a turn the bot has already
        const t = Math.max(tick, board.t, player.queue.at(-1)?.t ?? 0);
        player.queue.push({ n, t, d: DIRECTION_NUMBERS[turn] });
        return { ok: true, changed: true };
    }

    /** The game's tick at `now`: below 0 during the countdown */
    #tickAt(now: number): number {
        return Math.floor((now - (this.#data.playsAt ?? now)) / TICK_MS);
    }

    /** Plays every board on to where the bot keeps them, `LAG_TICKS` behind the clock */
    #advance(now: number): void {
        const d = this.#data;
        const mazes = this.mazes;
        if (d.phase !== "active" || mazes === undefined) return;
        const to = Math.min(this.lastTick, Math.max(0, this.#tickAt(now) - LAG_TICKS));
        let moved = false;
        for (const player of d.players) {
            const board = this.#board(player);
            if (board.t >= to) continue;
            player.queue = play(board, mazes, player.queue, to);
            player.board = pack(board, mazes.level(board.level));
            moved = true;
        }
        if (moved) {
            this.#moved = true;
            this.#changed();
        }
    }

    #board(player: ChatPlayer): Board {
        let board = this.#boards.get(player.id);
        if (board === undefined) {
            board = unpack(player.board, this.mazes!.level(player.board.level));
            this.#boards.set(player.id, board);
        }
        return board;
    }

    /** The players by score, the top first, the first to join first of those level with them */
    ranked(): ChatPlayer[] {
        return this.#data.players
            .map((p, i) => ({ p, i, score: this.#board(p).score }))
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .map(({ p }) => p);
    }

    #finish(ended: Ending, at: number): void {
        const d = this.#data;
        d.phase = "finished";
        d.ended = ended;
        d.winner = this.ranked()[0]?.id;
        d.finishedAt = at;
        // Turns the boards never reached are no use now
        for (const p of d.players) p.queue = [];
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
            seed: d.seed,
            startedAt: d.startedAt,
            playsAt: d.playsAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            players: d.players.map((p) => ({
                id: p.id,
                ack: p.ack,
                board: p.board,
                queue: p.queue.map((q) => [q.n, q.t, q.d]),
            })),
            now: this.#now(),
            rev: d.rev,
        };
    }

    /**
     * The card's result once the game's over, eg. "Time's up! @UserId(abc) won with 1,240
     * points", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        const winner = d.players.find((p) => p.id === d.winner);
        if (winner === undefined) return "The game ended with nobody in it";
        const points = this.#board(winner).score.toLocaleString("en-US");
        const what = d.players.length > 1 ? `won with ${points} points` : `scored ${points} points`;
        return `${d.ended === "time" ? "Time's up! " : ""}@UserId(${winner.id}) ${what}`;
    }

    /** How the game ended is its final state: every board as it finished */
    endState(): SharedState | undefined {
        return this.#data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): ChatManData {
        return this.#data;
    }
}
