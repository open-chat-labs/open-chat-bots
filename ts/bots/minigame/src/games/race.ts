// What every race has in common, whatever's raced: up to so many join, the host changes the
// settings in the lobby, and once the host starts it, everyone seated races at once, each on their
// own, until someone wins or the time's up, when whoever's furthest on wins. A race keeps its whole
// state in its data, which the store writes as it is. Each race (2048, the maze, ChatMan,
// Minesweeper, the Word Race, the Crate Race and the Dash Race) adds what's raced on, and how a
// racer gets on.
import {
    PUBLISH_EVERY_MS,
    type ConfigureResult,
    type Game,
    type GameKind,
    type Host,
    type Phase,
    type Seat,
} from "./game";
import { defaultSettings, type SettingSpec, type Settings } from "./settings";

/** A race's state, as the store writes it: `E` the ways it can end besides the time running out */
export type RaceData<R extends Seat, E extends string> = {
    phase: Phase;
    /** Who's joined, before the start */
    seats: Seat[];
    /** Everyone racing, once it starts, in the order they joined */
    players: R[];
    /** The `seq` of the last state published through the service */
    seq: number;
    /** Goes up with every change, so the page can tell the newer of two states */
    rev: number;
    createdAt: number;
    startedAt?: number;
    /** When the race ends if nobody's won it before */
    endsAt?: number;
    finishedAt?: number;
    ended?: E | "time";
    winner?: string;
    /** The settings chosen, by id; the rest are the defaults */
    settings?: Settings;
    /** Who ran `/play`: the one who can change the settings and start the race */
    host?: string;
    hostName?: string;
};

export type RaceOptions = {
    random?: () => number;
    now?: () => number;
    /** The settings to start with, eg. from the config; any left out is its default */
    settings?: Settings;
    host?: Host;
};

/** What a race is to its lobby: its settings, how many can race, and what players call it */
export type RaceSpec = {
    settings: readonly SettingSpec[];
    maxPlayers: number;
    /** "race" unless it's called something else, eg. "game" for ChatMan */
    noun?: string;
};

/** What every race's shared state has, which the page's lobby and clock read */
export type RaceBase<E extends string> = {
    phase: Phase;
    /** The settings as they stand, by id */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: E | "time";
    winner?: string;
};

/** A new race's data: open, with nobody in it */
export function openRace(options: RaceOptions = {}): RaceData<never, never> {
    return {
        phase: "open",
        seats: [],
        players: [],
        seq: 0,
        rev: 0,
        createdAt: (options.now ?? Date.now)(),
        settings: options.settings,
        host: options.host?.id,
        hostName: options.host?.name,
    };
}

/** A race of racers `R`, which ends as `E` or when the time's up, keeping `D` and sharing `S` */
export abstract class Race<R extends Seat, E extends string, D extends RaceData<R, E>, S>
    implements Game
{
    abstract readonly kind: GameKind;
    /** The race's state as it is, for the store to write. It changes as the race does. */
    readonly data: D;
    protected readonly random: () => number;
    protected readonly now: () => number;
    readonly #spec: RaceSpec;

    constructor(spec: RaceSpec, data: D, options: RaceOptions = {}) {
        this.#spec = spec;
        this.data = data;
        this.random = options.random ?? Math.random;
        this.now = options.now ?? Date.now;
    }

    get phase(): Phase {
        return this.data.phase;
    }

    get createdAt(): number {
        return this.data.createdAt;
    }

    get finishedAt(): number | undefined {
        return this.data.finishedAt;
    }

    get host(): string | undefined {
        return this.data.host;
    }

    /** The racer, if the user is one */
    protected racer(userId: string | undefined): R | undefined {
        return this.data.players.find((p) => p.id === userId);
    }

    isSeated(userId: string): boolean {
        return this.data.seats.some((s) => s.id === userId) || this.isPlayer(userId);
    }

    isPlayer(userId: string): boolean {
        return this.racer(userId) !== undefined;
    }

    join(userId: string, name: string): string | undefined {
        const d = this.data;
        if (d.phase !== "open") return this.#started();
        if (this.isSeated(userId)) return undefined;
        const max = this.#spec.maxPlayers;
        if (d.seats.length >= max) return `All ${max} places are taken`;
        d.seats.push({ id: userId, name });
        this.changed();
        return undefined;
    }

    /** Frees the seat before the start; a racer who leaves after it stays where they've got to */
    leave(userId: string): boolean {
        const d = this.data;
        if (d.phase !== "open") return false;
        const before = d.seats.length;
        d.seats = d.seats.filter((s) => s.id !== userId);
        if (d.seats.length === before) return false;
        this.changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(this.#spec.settings), ...this.data.settings };
    }

    configure(userId: string, settings: Settings): ConfigureResult {
        const d = this.data;
        if (d.phase !== "open") return { ok: false, error: this.#started() };
        if (userId !== d.host) return { ok: false, error: "Only the host can change the settings" };
        d.settings = { ...d.settings, ...settings };
        this.changed();
        return { ok: true };
    }

    cannotStart(): string | undefined {
        if (this.data.phase !== "open") return undefined;
        return this.data.seats.length === 0 ? "Nobody has joined yet" : undefined;
    }

    /** Starts everyone seated, as `begin` sets them off, with the race's time running */
    start(): string[] {
        const d: RaceData<R, E> = this.data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.now();
            d.players = this.begin(d.seats, now);
            d.seats = [];
            d.phase = "active";
            d.startedAt = now;
            d.endsAt = now + this.lengthMs();
            this.changed();
        }
        return d.players.map((p) => p.id);
    }

    /** Sets up what's raced on as the race starts, eg. its maze, and each racer's start */
    protected abstract begin(seats: readonly Seat[], now: number): R[];

    /** How long the race lasts from the start if nobody wins it first */
    protected lengthMs(): number {
        return this.settings().minutes * 60_000;
    }

    /** Everyone races at once */
    waitingFor(): string[] {
        return [];
    }

    /** Ends the race once the time's up, when the leader wins */
    endIfTimeUp(): boolean {
        const d = this.data;
        if (d.phase !== "active" || d.endsAt === undefined || this.now() < d.endsAt) return false;
        this.finish("time", this.leader(), d.endsAt);
        return true;
    }

    /** Who's furthest on, who wins when the time's up: nobody, if no one's got anywhere */
    protected abstract leader(): string | undefined;

    protected finish(ended: E | "time", winner: string | undefined, at: number): void {
        const d: RaceData<R, E> = this.data;
        d.phase = "finished";
        d.ended = ended;
        d.winner = winner;
        d.finishedAt = at;
        this.changed();
    }

    /** The bot was down: the race's clock doesn't run meanwhile */
    resume(downMs: number): boolean {
        const d = this.data;
        if (d.phase !== "active" || d.endsAt === undefined || downMs <= 0) return false;
        d.endsAt += downMs;
        this.changed();
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.data.seq;
    }

    protected changed(): void {
        this.data.rev++;
    }

    /** Everyone's names by id, as they joined */
    names(): Record<string, string> {
        const names: Record<string, string> = {};
        for (const p of [...this.data.seats, ...this.data.players]) names[p.id] = p.name;
        return names;
    }

    /** What every race's shared state has: the lobby, and the race's times and how it ended */
    protected base(): RaceBase<E> {
        const d = this.data;
        return {
            phase: d.phase,
            settings: this.settings(),
            host: d.host,
            hostName: d.hostName,
            seats: d.seats.map((s) => ({ ...s })),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
        };
    }

    abstract shared(): S;

    abstract result(): string | undefined;

    /** How the race ended is its final state */
    endState(): S | undefined {
        return this.data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): D {
        return this.data;
    }

    #started(): string {
        return `The ${this.#spec.noun ?? "race"} has started`;
    }
}
