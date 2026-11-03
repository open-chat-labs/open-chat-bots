// The Crate Race: up to twenty racers push the same four crates onto the same four goals, each on
// their own copy of one of Boxoban's levels (`levels.ts`), easy, medium or hard as the host sets
// it. The first to put every crate on a goal wins, or, when the time's up, whoever has the most on
// goals, then whoever got there first. A racer's moves are their path, which their page plays as
// they make it and sends to the bot whole: undoing one, or starting again, is a shorter path. The
// bot plays it too, so it knows where their crates are, which only they see while the race is on.
import { PUBLISH_EVERY_MS, type ConfigureResult, type Game, type Host } from "../game";
import { defaultSettings, type Settings } from "../settings";
import { isPath, play, readLevel, type Level } from "./board";
import { EASY_LEVELS, HARD_LEVELS, MEDIUM_LEVELS } from "./levels";
import { describeResult } from "./result";
import { CRATES_SETTINGS, EASY, HARD } from "./settings";
import {
    GAME_ID,
    MAX_PATH,
    MAX_PLAYERS,
    STATE_VERSION,
    type Ending,
    type OwnPath,
    type PathResponse,
    type Phase,
    type Seat,
    type SharedState,
} from "./types";

export type Racer = Seat & {
    path: string;
    placed: number;
    pushes: number;
    /** When their crates on goals last changed, which breaks a tie: whoever's had as many longest */
    placedAt?: number;
};

export type CratesData = {
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
    /** The level, once the race has started, and the fewest pushes it takes */
    level?: string;
    par?: number;
    ended?: Ending;
    winner?: string;
    settings?: Settings;
    host?: string;
    hostName?: string;
};

export type CratesOptions = {
    random?: () => number;
    now?: () => number;
    settings?: Settings;
    host?: Host;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type PathOutcome = { result: PathResponse; changed: boolean };

/** The levels a race's may be, by its difficulty, each its code then the fewest pushes it takes */
function levelsOf(difficulty: number): readonly string[] {
    return difficulty === EASY ? EASY_LEVELS : difficulty === HARD ? HARD_LEVELS : MEDIUM_LEVELS;
}

export class CrateRace implements Game {
    readonly kind = GAME_ID;
    readonly #data: CratesData;
    readonly #random: () => number;
    readonly #now: () => number;
    /** The level, read from its code, and the code it was read from */
    #level?: { code: string; level: Level | undefined };

    constructor(data: CratesData, options: CratesOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: CratesOptions = {}): CrateRace {
        const now = options.now ?? Date.now;
        return new CrateRace(
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

    get data(): CratesData {
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

    /** The race's level, once it's started */
    get level(): Level | undefined {
        const code = this.#data.level;
        if (code === undefined) return undefined;
        if (this.#level?.code !== code) this.#level = { code, level: readLevel(code) };
        return this.#level.level;
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

    /** Frees the seat before the start; a racer who leaves after it keeps where they've got */
    leave(userId: string): boolean {
        if (this.#data.phase !== "open") return false;
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        if (this.#data.seats.length === before) return false;
        this.#changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(CRATES_SETTINGS), ...this.#data.settings };
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

    /** Picks a level of the difficulty set, and starts everyone seated on it */
    start(): string[] {
        const d = this.#data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.#now();
            const levels = levelsOf(this.settings().difficulty);
            const [code, par] = levels[Math.floor(this.#random() * levels.length)].split(" ");
            d.level = code;
            d.par = Number(par);
            const placed = play(this.level!, "").board.placed;
            d.players = d.seats.map((s) => ({ ...s, path: "", placed, pushes: 0 }));
            d.seats = [];
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

    /**
     * Ends the race when the time's up: whoever has the most crates on goals wins, then whoever's
     * had that many longest, then whoever pushed the fewest times. Nobody, if nobody has one.
     */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || this.#now() < d.endsAt) return false;
        const at = (r: Racer) => r.placedAt ?? d.startedAt ?? 0;
        const [best] = [...d.players].sort(
            (a, b) => b.placed - a.placed || at(a) - at(b) || a.pushes - b.pushes,
        );
        this.#finish("time", best !== undefined && best.placed > 0 ? best.id : undefined, d.endsAt);
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
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /** A racer's own moves, which only they see while the race is on */
    own(userId: string): OwnPath | undefined {
        const racer = this.#data.players.find((p) => p.id === userId);
        return racer === undefined ? undefined : { path: racer.path };
    }

    /**
     * A racer's moves, `{ "path": "rrdlu" }`, every move they've made from the level's start less
     * the ones they've undone, answered with their path as the bot has it. No path at all just asks
     * for it, eg. as the page opens. A path with a move that can't be made is refused, whole.
     * Walking about changes nothing anyone else sees, so only a push is published.
     */
    path(userId: string, body: unknown): PathOutcome {
        const d = this.#data;
        const fail = (error: string): PathOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed: false,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = d.players.find((p) => p.id === userId);
        if (racer === undefined) return fail("You aren't in this race");
        const path = (body as { path?: unknown } | undefined)?.path;
        if (path === undefined) {
            return { result: { ok: true, own: this.own(userId)! }, changed: false };
        }
        if (d.phase === "finished") return fail("The race is over");
        if (!isPath(path, MAX_PATH)) {
            return fail(`A path is up to ${MAX_PATH} moves, each one of u, d, l and r`);
        }
        const level = this.level;
        if (level === undefined) return fail("This race's level can't be read");
        const { board, played } = play(level, path);
        if (played < path.length) return fail("One of those moves can't be made");
        const changed = board.pushes !== racer.pushes || board.placed !== racer.placed;
        if (board.placed !== racer.placed) racer.placedAt = this.#now();
        racer.path = path;
        racer.placed = board.placed;
        racer.pushes = board.pushes;
        if (board.solved) {
            this.#finish("solved", racer.id, this.#now());
        } else if (changed) {
            this.#changed();
        }
        return { result: { ok: true, own: this.own(userId)! }, changed: changed || board.solved };
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

    /** Each racer's own moves while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnPath> | undefined {
        if (this.#data.phase !== "active") return undefined;
        return Object.fromEntries(this.#data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /**
     * What everyone sees: how far each racer's got, and, once it's over, where their crates ended
     * up, and the winner's moves
     */
    shared(): SharedState {
        const d = this.#data;
        const finished = d.phase === "finished";
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
            level: d.level,
            par: d.par,
            racers: d.players.map((p) => {
                const racer = { id: p.id, placed: p.placed, pushes: p.pushes };
                const level = this.level;
                if (!finished || level === undefined) return racer;
                const { board } = play(level, p.path);
                return { ...racer, crates: [...board.crates], player: board.player };
            }),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            path: finished ? d.players.find((p) => p.id === d.winner)?.path : undefined,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) put every crate on a goal in 48s,
     * with 23 pushes", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        const winner = d.players.find((p) => p.id === d.winner);
        const crates = this.level?.crates.length ?? 0;
        return describeResult(d, winner && { ...winner, crates }, (id) => `@UserId(${id})`);
    }

    /** How the race ended is its final state: where everyone's crates are, and the winner's moves */
    endState(): SharedState | undefined {
        return this.#data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): CratesData {
        return this.#data;
    }
}
