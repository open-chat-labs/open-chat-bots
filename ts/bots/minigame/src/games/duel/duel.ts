// A duel as the bot hosts it: two join, and once the host starts it, who moves first is the host,
// their opponent, or random, as the settings say. Each side has its minutes for the whole game,
// which its clock runs down on its turns once it's made its first move, and a flag falling loses.
// The first move is free, but if it isn't made within `FIRST_MOVE_MS`, the game's called off. A
// player can resign, and one who leaves the game loses it. The board is the game's own `Position`,
// replayed from the moves, which the page replays too; this knows who sits where, the clocks, and
// what the card and the page are told.
import {
    FIRST_MOVE_MS,
    PUBLISH_EVERY_MS,
    type ConfigureResult,
    type Game,
    type GameKind,
    type Host,
    type Phase,
} from "../game";
import { defaultSettings, type Settings } from "../settings";
import { FIRST_IS_HOST, FIRST_IS_OPPONENT } from "./settings";
import {
    describeEnding,
    other,
    replay,
    type ActionResponse,
    type DuelRules,
    type DuelState,
    type Ending,
    type Position,
    type Seat,
} from "./types";

export type DuelData<M> = {
    /** Who's joined, in order, with their names. Once the game starts, by seat. */
    players: { id: string; name: string }[];
    /** The `seq` of the last state published, which each state goes above */
    seq: number;
    createdAt: number;
    startedAt?: number;
    finishedAt?: number;
    /** The settings chosen, by id; the rest are the defaults */
    settings?: Settings;
    /**
     * Who ran `/play`: the one who can change the settings and start the game, and "the host" in
     * `first`
     */
    host?: string;
    hostName?: string;
    moves: M[];
    /**
     * Once the game starts: what each seat had left when its clock last stopped, and when the
     * side to move's turn started, which its clock runs from if it's moved before. Once it's over,
     * nothing runs.
     */
    clock?: { ms: [number, number]; since: number };
    ending?: Ending;
};

export type DuelOptions = {
    random?: () => number;
    now?: () => number;
    /** The settings to start with, eg. for a test; any left out is its default */
    settings?: Settings;
    host?: Host;
};

export class Duel<M, P extends Position<M>> implements Game {
    readonly kind: GameKind;
    readonly #rules: DuelRules<M, P>;
    readonly #data: DuelData<M>;
    readonly #random: () => number;
    readonly #now: () => number;
    /** The board, made afresh as the game starts, as the settings may have changed meanwhile */
    #position: P;

    /** A duel from what the store wrote of it, its board replayed from the moves */
    constructor(rules: DuelRules<M, P>, data: DuelData<M>, options: DuelOptions = {}) {
        this.kind = rules.kind;
        this.#rules = rules;
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
        this.#position = replay(rules, data.moves, this.settings());
    }

    static create<M, P extends Position<M>>(
        rules: DuelRules<M, P>,
        options: DuelOptions = {},
    ): Duel<M, P> {
        const now = options.now ?? Date.now;
        return new Duel(
            rules,
            {
                players: [],
                seq: 0,
                createdAt: now(),
                settings: options.settings,
                host: options.host?.id,
                hostName: options.host?.name,
                moves: [],
            },
            options,
        );
    }

    get data(): DuelData<M> {
        return this.#data;
    }

    get position(): P {
        return this.#position;
    }

    get phase(): Phase {
        if (this.#data.clock === undefined) return "open";
        return this.#data.ending === undefined ? "active" : "finished";
    }

    get createdAt(): number {
        return this.#data.createdAt;
    }

    get finishedAt(): number | undefined {
        return this.#data.finishedAt;
    }

    get ending(): Ending | undefined {
        return this.#data.ending;
    }

    /** Who sits in the seat, once the game has started */
    playerAt(seat: Seat): string | undefined {
        return this.#data.clock === undefined ? undefined : this.#data.players[seat]?.id;
    }

    /** The seat the user plays, once the game has started */
    seatOf(userId: string): Seat | undefined {
        if (this.playerAt(0) === userId) return 0;
        if (this.playerAt(1) === userId) return 1;
        return undefined;
    }

    isSeated(userId: string): boolean {
        return this.#data.players.some((p) => p.id === userId);
    }

    isPlayer(userId: string): boolean {
        return this.#data.clock !== undefined && this.isSeated(userId);
    }

    join(userId: string, name: string): string | undefined {
        if (this.#data.clock !== undefined) return "The game has started";
        if (this.isSeated(userId)) return undefined;
        if (this.#data.players.length >= 2) return "This game is for two";
        this.#data.players.push({ id: userId, name });
        return undefined;
    }

    /**
     * Before the start, frees the user's seat. After it, the game can't go on without them, so the
     * other player wins.
     */
    leave(userId: string): boolean {
        if (this.#data.clock === undefined) {
            const before = this.#data.players.length;
            this.#data.players = this.#data.players.filter((p) => p.id !== userId);
            return this.#data.players.length < before;
        }
        // A flag that fell before they left is the result: the leave doesn't change it
        const flagged = this.endIfTimeUp();
        const seat = this.seatOf(userId);
        if (seat === undefined || this.#data.ending !== undefined) return flagged;
        this.#end({ kind: "abandonment", winner: other(seat) });
        return true;
    }

    cannotStart(): string | undefined {
        if (this.#data.clock !== undefined) return undefined;
        if (this.#data.players.length < 2) return `${this.#rules.title} needs two players`;
        return undefined;
    }

    /**
     * Starts the game between the two who've joined. Who moves first is the host or their opponent
     * if the settings say so and the host is playing; otherwise it's random.
     */
    start(): string[] {
        if (this.#data.clock === undefined && this.#data.players.length === 2) {
            const settings = this.settings();
            const host = this.#data.host;
            const hostFirst = host !== undefined && this.#data.players[0].id === host;
            const hostPlays = host !== undefined && this.isSeated(host);
            const reverse =
                hostPlays && settings.first === FIRST_IS_HOST
                    ? !hostFirst
                    : hostPlays && settings.first === FIRST_IS_OPPONENT
                      ? hostFirst
                      : this.#random() < 0.5;
            if (reverse) this.#data.players.reverse();
            this.#position = this.#rules.start(settings);
            const now = this.#now();
            const perSide = settings.minutes * 60_000;
            this.#data.clock = { ms: [perSide, perSide], since: now };
            this.#data.startedAt = now;
        }
        return this.#data.players.map((p) => p.id);
    }

    /** The player whose move it is, while the game's on */
    waitingFor(): string[] {
        if (this.phase !== "active") return [];
        const id = this.playerAt(this.#position.turn);
        return id === undefined ? [] : [id];
    }

    /** Every setting as it stands: the ones chosen over the defaults */
    settings(): Settings {
        return { ...defaultSettings(this.#rules.settings), ...this.#data.settings };
    }

    get host(): string | undefined {
        return this.#data.host;
    }

    /** Changes settings, which only the host can, and only before the game starts */
    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#data.clock !== undefined) return { ok: false, error: "The game has started" };
        if (userId !== this.#data.host) {
            return { ok: false, error: "Only the host can change the settings" };
        }
        this.#data.settings = { ...this.#data.settings, ...settings };
        return { ok: true };
    }

    /** How long the seat has left, as its clock runs */
    timeLeft(seat: Seat): number {
        const clock = this.#data.clock;
        if (clock === undefined) return this.settings().minutes * 60_000;
        const left = clock.ms[seat];
        if (seat !== this.#running()) return left;
        return Math.max(0, left - Math.max(0, this.#now() - clock.since));
    }

    /**
     * When the game ends unless the side to move moves first: when its flag falls, or, before its
     * first move, when the game's called off
     */
    deadline(): number | undefined {
        const clock = this.#data.clock;
        if (clock === undefined || this.phase !== "active") return undefined;
        const turn = this.#position.turn;
        return clock.since + (this.#hasMoved(turn) ? clock.ms[turn] : FIRST_MOVE_MS);
    }

    /** How long the side to move has left to make its first move, until it's made one */
    firstMoveLeft(): number | undefined {
        const clock = this.#data.clock;
        if (clock === undefined || this.phase !== "active" || this.#running() !== null) {
            return undefined;
        }
        return Math.max(0, FIRST_MOVE_MS - Math.max(0, this.#now() - clock.since));
    }

    /**
     * The seat whose clock is running: the side to move, once it's made its first move, while the
     * game's on
     */
    #running(): Seat | null {
        if (this.phase !== "active") return null;
        const turn = this.#position.turn;
        return this.#hasMoved(turn) ? turn : null;
    }

    // Seat 0 makes the first move and seat 1 the second: no duel's first move leaves the other
    // without one
    #hasMoved(seat: Seat): boolean {
        return this.#data.moves.length > seat;
    }

    /**
     * Ends the game if the side to move's flag has fallen, which loses it, or it's let the time for
     * its first move run out, which calls the game off
     */
    endIfTimeUp(): boolean {
        const deadline = this.deadline();
        if (deadline === undefined || this.#now() < deadline) return false;
        const turn = this.#position.turn;
        this.#end(
            this.#hasMoved(turn)
                ? { kind: "timeout", winner: other(turn) }
                : { kind: "aborted", seat: turn },
        );
        return true;
    }

    /** The side to move isn't charged for the time the bot was down, nor its first move's time */
    resume(downMs: number): boolean {
        if (this.phase !== "active" || downMs <= 0) return false;
        this.#data.clock!.since += downMs;
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /** Plays the user's move, as the game's rules write it, answering the new state or why not */
    play(userId: string, raw: unknown): ActionResponse<M> {
        return this.#act(userId, (seat) => {
            if (seat !== this.#position.turn) return "It's not your turn";
            const move = this.#rules.parseMove(raw);
            if (move === undefined) return "That isn't a move";
            // What the mover has left as they move, which is all of it on their first move
            const left = this.timeLeft(seat);
            const error = this.#position.play(move);
            if (error !== undefined) return error;
            this.#data.moves.push(move);
            // The mover's clock stops and the other's turn starts
            const clock = this.#data.clock!;
            clock.ms[seat] = left;
            clock.since = this.#now();
            const outcome = this.#position.outcome;
            if (outcome !== undefined) this.#end({ kind: "board", winner: outcome.winner });
            return undefined;
        });
    }

    /** The user gives up, whoever's turn it is */
    resign(userId: string): ActionResponse<M> {
        return this.#act(userId, (seat) => {
            this.#end({ kind: "resignation", winner: other(seat) });
            return undefined;
        });
    }

    // Something the user does as the seat they play
    #act(userId: string, action: (seat: Seat) => string | undefined): ActionResponse<M> {
        if (this.#data.clock === undefined) {
            return {
                ok: false,
                error: this.isSeated(userId) ? "Start the game first" : "You're not playing",
            };
        }
        // A flag that's fallen comes first, whatever the request
        this.endIfTimeUp();
        const seat = this.seatOf(userId);
        if (seat === undefined) return { ok: false, error: "You're not playing" };
        if (this.#data.ending !== undefined) return { ok: false, error: "The game has finished" };
        const error = action(seat);
        if (error !== undefined) return { ok: false, error };
        return { ok: true, shared: this.shared() };
    }

    // Stops the clocks and records how the game ended
    #end(ending: Ending): void {
        const clock = this.#data.clock!;
        const turn = this.#position.turn;
        clock.ms[turn] = this.timeLeft(turn);
        clock.since = this.#now();
        this.#data.ending = ending;
        this.#data.finishedAt ??= clock.since;
    }

    shared(): DuelState<M> {
        const d = this.#data;
        const names: Record<string, string> = {};
        // The host's name, so the lobby can say who goes first before they've joined
        if (d.host !== undefined && d.hostName !== undefined) names[d.host] = d.hostName;
        for (const p of d.players) names[p.id] = p.name;
        return {
            version: this.#rules.version,
            game: this.#rules.kind,
            phase: this.phase,
            players: d.players.map((p) => p.id),
            names,
            settings: this.settings(),
            host: d.host,
            moves: [...d.moves],
            clock:
                d.clock === undefined
                    ? undefined
                    : {
                          at: this.#now(),
                          ms: [this.timeLeft(0), this.timeLeft(1)],
                          running: this.#running(),
                          firstMoveMs: this.firstMoveLeft(),
                      },
            ending: d.ending === undefined ? undefined : { ...d.ending },
            startedAt: d.startedAt,
            finishedAt: d.finishedAt,
        };
    }

    /**
     * The card's result once the game is over, eg. "@UserId(abc) won with four in a row": the
     * players are mentions, so the card shows their usernames as they are now
     */
    result(): string | undefined {
        const ending = this.#data.ending;
        if (ending === undefined) return undefined;
        return describeEnding(this.#rules, ending, this.#position, (seat) => {
            const id = this.playerAt(seat);
            return id === undefined ? "A player" : `@UserId(${id})`;
        });
    }

    /**
     * How the game ended is its final state, with every move, which the page replays to step
     * through it. A duel is short, so it's well within the end state's 16 KB.
     */
    endState(): DuelState<M> | undefined {
        return this.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): DuelData<M> {
        return this.#data;
    }
}
