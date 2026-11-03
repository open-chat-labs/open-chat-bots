// The Minesweeper race: up to ten racers, each with their own board of the same minefield, laid at
// the start so that it can be cleared without a guess (`field.ts`), with the same cells open to
// begin with. The first to open every safe cell wins, or, when the time's up, whoever's opened the
// most. A racer who sets off a mine can do nothing for a few seconds, and goes on from there. Only
// the bot knows where the mines are: a racer's page sends what they click, and the bot answers
// with their board, which also comes in their private part of each state, and which no one else
// sees until the race is over.
import { PUBLISH_EVERY_MS, type ConfigureResult, type Game, type Host } from "../game";
import { duration } from "../race2048/race";
import { defaultSettings, type Settings } from "../settings";
import { fieldOf, lay, mineCells, neighbours, type Field } from "./field";
import { MINES, MINESWEEPER_SETTINGS } from "./settings";
import {
    BOOM,
    FLAG,
    GAME_ID,
    HIDDEN,
    MAX_ACTS,
    MAX_PLAYERS,
    PENALTY_MS,
    STATE_VERSION,
    type Act,
    type ActResponse,
    type Ending,
    type OwnBoard,
    type Phase,
    type Seat,
    type SharedState,
    type View,
} from "./types";

export type Racer = Seat & {
    view: View;
    cleared: number;
    hits: number;
    rev: number;
    /** When they can do anything again, after setting off a mine */
    frozenUntil?: number;
    /** When they last opened a safe cell, which breaks a tie when the time runs out */
    clearedAt?: number;
};

export type MinesData = {
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
    /** The field, once the race has started: where its mines are, and the cell it opens from */
    mineCells?: number[];
    start?: number;
    ended?: Ending;
    winner?: string;
    settings?: Settings;
    host?: string;
    hostName?: string;
};

export type MinesOptions = {
    random?: () => number;
    now?: () => number;
    settings?: Settings;
    host?: Host;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type ActOutcome = { result: ActResponse; changed: boolean };

/** What one action did to a racer's board, or why it was refused */
type Applied = { changed: boolean; error?: string };

export class MinesweeperRace implements Game {
    readonly kind = GAME_ID;
    readonly #data: MinesData;
    readonly #random: () => number;
    readonly #now: () => number;
    #field?: Field;

    constructor(data: MinesData, options: MinesOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: MinesOptions = {}): MinesweeperRace {
        const now = options.now ?? Date.now;
        return new MinesweeperRace(
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

    get data(): MinesData {
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

    get mines(): number {
        return MINES[this.size] ?? Math.round((this.size * this.size) / 6);
    }

    /** The field, once the race has started */
    get field(): Field | undefined {
        const d = this.#data;
        if (this.#field === undefined && d.mineCells !== undefined && d.start !== undefined) {
            this.#field = fieldOf(this.size, d.mineCells, d.start);
        }
        return this.#field;
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

    /** Frees the seat before the start; a racer who leaves after it keeps what they've cleared */
    leave(userId: string): boolean {
        if (this.#data.phase !== "open") return false;
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        if (this.#data.seats.length === before) return false;
        this.#changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(MINESWEEPER_SETTINGS), ...this.#data.settings };
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

    /** Lays a field from a new seed, and deals everyone seated a board with its start open */
    start(): string[] {
        const d = this.#data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.#now();
            const field = lay(this.size, this.mines, Math.floor(this.#random() * 2 ** 31));
            this.#field = field;
            d.mineCells = mineCells(field);
            d.start = field.start;
            const cells = Array.from({ length: this.size * this.size }, () => HIDDEN);
            const cleared = openFrom(field, cells, field.start);
            const view = cells.join("");
            d.players = d.seats.map((s) => ({ ...s, view, cleared, hits: 0, rev: 0 }));
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
     * Ends the race when the time's up: whoever's opened the most safe cells wins, then whoever set
     * off fewer mines, then whoever got there first
     */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || this.#now() < d.endsAt) return false;
        const at = (r: Racer) => r.clearedAt ?? d.startedAt ?? 0;
        const ranked = [...d.players].sort(
            (a, b) => b.cleared - a.cleared || a.hits - b.hits || at(a) - at(b),
        );
        this.#finish("time", ranked[0]?.id, d.endsAt);
        return true;
    }

    /** The bot was down: the race's clock doesn't run meanwhile, nor does a racer's wait */
    resume(downMs: number): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || downMs <= 0) return false;
        d.endsAt += downMs;
        for (const p of d.players) {
            if (p.frozenUntil !== undefined) p.frozenUntil += downMs;
        }
        this.#changed();
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /** A racer's own board, which only they see while the race is on */
    own(userId: string): OwnBoard | undefined {
        const racer = this.#data.players.find((p) => p.id === userId);
        if (racer === undefined) return undefined;
        const { view, rev, cleared, hits, frozenUntil } = racer;
        const frozenMs =
            this.#data.phase === "active" && frozenUntil !== undefined
                ? Math.max(0, frozenUntil - this.#now())
                : 0;
        return { view, rev, cleared, hits, frozenMs };
    }

    /**
     * A racer's actions, `{ acts: [{ reveal: 12 }, { flag: 30, on: true }, ..] }`, taken in order,
     * answered with their board. None at all just asks for the board. One refused, eg. while they
     * wait after setting off a mine, doesn't stop the rest, and the answer says why.
     */
    act(userId: string, body: unknown): ActOutcome {
        const d = this.#data;
        const fail = (error: string, changed = false): ActOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = d.players.find((p) => p.id === userId);
        if (racer === undefined) return fail("You aren't in this race");
        const acts = (body as { acts?: unknown } | undefined)?.acts;
        if (!Array.isArray(acts) || acts.length > MAX_ACTS) {
            return fail(`Send up to ${MAX_ACTS} actions as "acts"`);
        }
        if (acts.length > 0 && d.phase === "finished") return fail("The race is over");
        const cells = [...racer.view];
        let changed = false;
        let error: string | undefined;
        for (const act of acts) {
            if (d.phase !== "active") break;
            const before = racer.cleared;
            const applied = this.#apply(racer, cells, act);
            error ??= applied.error;
            if (!applied.changed) continue;
            changed = true;
            racer.view = cells.join("");
            racer.rev++;
            if (racer.cleared > before) racer.clearedAt = this.#now();
            if (racer.cleared === this.size * this.size - this.mines) {
                this.#finish("cleared", racer.id, this.#now());
            }
        }
        if (changed && d.phase === "active") this.#changed();
        if (error !== undefined) return fail(error, changed);
        return { result: { ok: true, own: this.own(userId)! }, changed };
    }

    #apply(racer: Racer, cells: string[], act: unknown): Applied {
        const field = this.field!;
        const parsed = parseAct(act, cells.length);
        if (parsed === undefined) return { changed: false, error: "That isn't an action" };
        const now = this.#now();
        if (racer.frozenUntil !== undefined && now < racer.frozenUntil) {
            const seconds = Math.ceil((racer.frozenUntil - now) / 1000);
            return { changed: false, error: `You set off a mine: wait ${seconds}s` };
        }
        if ("flag" in parsed) {
            const { flag: cell, on } = parsed;
            if (cells[cell] !== (on ? HIDDEN : FLAG)) return { changed: false };
            cells[cell] = on ? FLAG : HIDDEN;
            return { changed: true };
        }
        let targets: number[];
        if ("reveal" in parsed) {
            if (cells[parsed.reveal] !== HIDDEN) return { changed: false };
            targets = [parsed.reveal];
        } else {
            // A number with as many flags round it as it says opens the rest of its neighbours
            const count = Number(cells[parsed.chord]);
            if (!(count > 0)) return { changed: false };
            const around = neighbours(field.size, parsed.chord);
            const marked = around.filter((n) => cells[n] === FLAG || cells[n] === BOOM).length;
            if (marked !== count) return { changed: false };
            targets = around.filter((n) => cells[n] === HIDDEN);
            if (targets.length === 0) return { changed: false };
        }
        for (const cell of targets) {
            if (field.mine[cell] === 1) {
                cells[cell] = BOOM;
                racer.hits++;
                racer.frozenUntil = now + PENALTY_MS;
            } else {
                racer.cleared += openFrom(field, cells, cell);
            }
        }
        return { changed: true };
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

    /** Each racer's own board while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnBoard> | undefined {
        if (this.#data.phase !== "active") return undefined;
        return Object.fromEntries(this.#data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /** What everyone sees: how far each racer's got, and, once it's over, their boards too */
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
            size: this.size,
            mines: this.mines,
            racers: d.players.map(({ id, cleared, hits, rev, view }) =>
                finished ? { id, cleared, hits, rev, view } : { id, cleared, hits, rev },
            ),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            mineCells: finished ? d.mineCells : undefined,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) cleared the field in 1m 12s", or
     * "Time's up! @UserId(abc) cleared the most", the winner a mention so the card shows their
     * username as it is now
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        if (d.winner === undefined) return "The race ended with nobody in it";
        const who = `@UserId(${d.winner})`;
        if (d.ended === "cleared" && d.startedAt !== undefined && d.finishedAt !== undefined) {
            return `${who} cleared the field in ${duration(d.finishedAt - d.startedAt)}`;
        }
        return `Time's up! ${who} cleared the most`;
    }

    /** How the race ended is its final state: everyone's board, and where the mines were */
    endState(): SharedState | undefined {
        return this.#data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): MinesData {
        return this.#data;
    }
}

/** An action, if it is one, on a cell of the board */
function parseAct(act: unknown, cells: number): Act | undefined {
    if (act === null || typeof act !== "object") return undefined;
    const a = act as Record<string, unknown>;
    const isCell = (value: unknown): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value < cells;
    if (isCell(a.reveal)) return { reveal: a.reveal };
    if (isCell(a.chord)) return { chord: a.chord };
    if (isCell(a.flag) && typeof a.on === "boolean") return { flag: a.flag, on: a.on };
    return undefined;
}

/**
 * Opens a safe cell on a board, and, if it touches no mine, its neighbours, and so on, as the
 * player would anyway, leaving flags as they are. How many cells it opened.
 */
export function openFrom(field: Field, cells: string[], from: number): number {
    let opened = 0;
    const stack = [from];
    while (stack.length > 0) {
        const cell = stack.pop()!;
        if (cells[cell] !== HIDDEN || field.mine[cell] === 1) continue;
        cells[cell] = String(field.count[cell]);
        opened++;
        if (field.count[cell] === 0) stack.push(...neighbours(field.size, cell));
    }
    return opened;
}
