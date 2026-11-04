// ChatMan: up to ten players, each with their own board, in the same mazes with the same spam bots,
// all at once. The top score wins when the time's up, or when everyone's out of lives. Each page
// plays its own board at once, and sends its turns live, over the socket (`live.ts`), each with the
// tick it was taken at. The bot doesn't take the page's word for anything: it plays every board
// itself, with the same rules (`rules.ts`), a little behind the game's clock, taking each turn at
// its tick, so a turn has that long to arrive. One that's later is taken as soon as the bot can, and
// the page puts its board where the bot has it. The mazes are built from a seed chosen at the start.
import type { LiveResult, Seat } from "../game";
import { isDirection } from "../maze/maze";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
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

export type ChatManData = RaceData<ChatPlayer, Ending> & {
    /** When the boards start moving, after the countdown */
    playsAt?: number;
    seed?: number;
};

/**
 * How often the game's state goes through the service, which spectators see it by, at most every
 * 250 ms anyway, and over the socket: every board moves all the time, and each page plays them on
 * between states, so a turn needn't go out the moment it comes in
 */
const PUBLISH_MS = 250;
const LIVE_MS = 100;

const refused = (error: string): LiveResult => ({ ok: false, error, changed: true });

export class ChatManRace extends Race<ChatPlayer, Ending, ChatManData> {
    readonly kind = GAME_ID;
    #mazes?: Mazes;
    /** Each player's board, unpacked, as it's played on */
    readonly #boards = new Map<string, Board>();
    /** Whether the boards have moved on since `tick` last said so */
    #moved = false;

    constructor(data: ChatManData, options: RaceOptions = {}) {
        super({ settings: CHATMAN_SETTINGS, maxPlayers: MAX_PLAYERS, noun: "game" }, data, options);
    }

    static create(options: RaceOptions = {}): ChatManRace {
        return new ChatManRace(openRace(options), options);
    }

    /** The mazes, once the game has started */
    get mazes(): Mazes | undefined {
        if (this.#mazes === undefined && this.data.seed !== undefined) {
            this.#mazes = new Mazes(this.data.seed);
        }
        return this.#mazes;
    }

    /** The tick the game ends on */
    get lastTick(): number {
        return this.settings().minutes * 60 * TICKS_PER_SECOND;
    }

    /** A player's board as the bot has it */
    board(userId: string): Board | undefined {
        const player = this.racer(userId);
        return player === undefined ? undefined : this.#board(player);
    }

    /** Gives everyone seated the same new board, in mazes from a new seed, after a countdown */
    protected begin(seats: readonly Seat[], now: number): ChatPlayer[] {
        const d = this.data;
        d.seed = Math.floor(this.random() * 2 ** 31);
        d.playsAt = now + COUNTDOWN_MS;
        const board = pack(newBoard(d.seed, this.settings().lives), this.mazes!.level(1));
        return seats.map((s) => ({ ...s, board: { ...board }, queue: [], ack: 0 }));
    }

    /** The countdown, then the game's minutes */
    protected override lengthMs(): number {
        return COUNTDOWN_MS + super.lengthMs();
    }

    /**
     * Ends the game once the time's up, and the turns on their way have had time to arrive, or
     * once everyone's out of lives: the top score wins
     */
    override endIfTimeUp(): boolean {
        const d = this.data;
        if (d.phase !== "active" || d.endsAt === undefined) return false;
        const now = this.now();
        this.#advance(now);
        if (now >= d.endsAt + LAG_TICKS * TICK_MS) {
            this.finish("time", this.leader(), d.endsAt);
            return true;
        }
        if (d.players.every((p) => this.#board(p).out)) {
            this.finish("out", this.leader(), now);
            return true;
        }
        return false;
    }

    /** The top score */
    protected leader(): string | undefined {
        return this.ranked()[0]?.id;
    }

    /** Plays the boards on to now, and says whether they've moved since this was last called */
    tick(): boolean {
        this.#advance(this.now());
        const moved = this.#moved;
        this.#moved = false;
        return moved;
    }

    /** The bot was down: the game's clock doesn't run meanwhile, the countdown's neither */
    override resume(downMs: number): boolean {
        if (!super.resume(downMs)) return false;
        const d = this.data;
        for (const key of ["startedAt", "playsAt"] as const) {
            if (d[key] !== undefined) d[key] += downMs;
        }
        return true;
    }

    override publishEveryMs(): number {
        return PUBLISH_MS;
    }

    liveEveryMs(): number {
        return LIVE_MS;
    }

    /**
     * A player's turn, `{ turn: "left", n: 7, tick: 1234 }`, where `n` counts their turns from 1
     * and `tick` is when they took it. A turn the bot's had already, eg. sent again after a
     * reconnect, changes nothing. One it refuses is still counted as had, so the page drops it.
     */
    receive(userId: string, message: unknown): LiveResult {
        const d = this.data;
        if (d.phase === "open") return { ...refused("The game hasn't started"), changed: false };
        if (d.phase === "finished") return { ...refused("The game is over"), changed: false };
        const player = this.racer(userId);
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
        this.changed();
        const now = this.now();
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
        return Math.floor((now - (this.data.playsAt ?? now)) / TICK_MS);
    }

    /** Plays every board on to where the bot keeps them, `LAG_TICKS` behind the clock */
    #advance(now: number): void {
        const d = this.data;
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
            this.changed();
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
        return this.data.players
            .map((p, i) => ({ p, i, score: this.#board(p).score }))
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .map(({ p }) => p);
    }

    protected override finish(ended: Ending, winner: string | undefined, at: number): void {
        // Turns the boards never reached are no use now
        for (const p of this.data.players) p.queue = [];
        super.finish(ended, winner, at);
    }

    shared(): SharedState {
        const d = this.data;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            seed: d.seed,
            playsAt: d.playsAt,
            players: d.players.map((p) => ({
                id: p.id,
                ack: p.ack,
                board: p.board,
                queue: p.queue.map((q) => [q.n, q.t, q.d]),
            })),
            now: this.now(),
            rev: d.rev,
        };
    }

    /**
     * The card's result once the game's over, eg. "Time's up! @UserId(abc) won with 1,240
     * points", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        const winner = d.players.find((p) => p.id === d.winner);
        if (winner === undefined) return "The game ended with nobody in it";
        const points = this.#board(winner).score.toLocaleString("en-US");
        const what = d.players.length > 1 ? `won with ${points} points` : `scored ${points} points`;
        return `${d.ended === "time" ? "Time's up! " : ""}@UserId(${winner.id}) ${what}`;
    }
}
