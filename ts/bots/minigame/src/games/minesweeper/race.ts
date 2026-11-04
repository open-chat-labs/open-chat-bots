// The Minesweeper race: up to ten racers, each with their own board of the same minefield, laid at
// the start so that it can be cleared without a guess (`field.ts`), with the same cells open to
// begin with. The first to open every safe cell wins, or, when the time's up, whoever's opened the
// most. A racer who sets off a mine can do nothing for a few seconds, and goes on from there. Only
// the bot knows where the mines are: a racer's page sends what they click, and the bot answers
// with their board, which also comes in their private part of each state, and which no one else
// sees until the race is over.
import { duration } from "../duration";
import type { Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
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

export type MinesData = RaceData<Racer, Ending> & {
    /** The field, once the race has started: where its mines are, and the cell it opens from */
    mineCells?: number[];
    start?: number;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type ActOutcome = { result: ActResponse; changed: boolean };

/** What one action did to a racer's board, or why it was refused */
type Applied = { changed: boolean; error?: string };

export class MinesweeperRace extends Race<Racer, Ending, MinesData> {
    readonly kind = GAME_ID;
    #field?: Field;

    constructor(data: MinesData, options: RaceOptions = {}) {
        super({ settings: MINESWEEPER_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): MinesweeperRace {
        return new MinesweeperRace(openRace(options), options);
    }

    get size(): number {
        return this.settings().size;
    }

    get mines(): number {
        return MINES[this.size] ?? Math.round((this.size * this.size) / 6);
    }

    /** The field, once the race has started */
    get field(): Field | undefined {
        const d = this.data;
        if (this.#field === undefined && d.mineCells !== undefined && d.start !== undefined) {
            this.#field = fieldOf(this.size, d.mineCells, d.start);
        }
        return this.#field;
    }

    /** Lays a field from a new seed, and deals everyone seated a board with its start open */
    protected begin(seats: readonly Seat[]): Racer[] {
        const field = lay(this.size, this.mines, Math.floor(this.random() * 2 ** 31));
        this.#field = field;
        this.data.mineCells = mineCells(field);
        this.data.start = field.start;
        const cells = Array.from({ length: this.size * this.size }, () => HIDDEN);
        const cleared = openFrom(field, cells, field.start);
        const view = cells.join("");
        return seats.map((s) => ({ ...s, view, cleared, hits: 0, rev: 0 }));
    }

    /** Whoever's opened the most safe cells, then whoever set off fewer mines, then got there first */
    protected leader(): string | undefined {
        const d = this.data;
        const at = (r: Racer) => r.clearedAt ?? d.startedAt ?? 0;
        const ranked = [...d.players].sort(
            (a, b) => b.cleared - a.cleared || a.hits - b.hits || at(a) - at(b),
        );
        return ranked[0]?.id;
    }

    /** The bot was down: the race's clock doesn't run meanwhile, nor does a racer's wait */
    override resume(downMs: number): boolean {
        if (!super.resume(downMs)) return false;
        for (const p of this.data.players) {
            if (p.frozenUntil !== undefined) p.frozenUntil += downMs;
        }
        return true;
    }

    /** A racer's own board, which only they see while the race is on */
    own(userId: string): OwnBoard | undefined {
        const racer = this.racer(userId);
        if (racer === undefined) return undefined;
        const { view, rev, cleared, hits, frozenUntil } = racer;
        const frozenMs =
            this.data.phase === "active" && frozenUntil !== undefined
                ? Math.max(0, frozenUntil - this.now())
                : 0;
        return { view, rev, cleared, hits, frozenMs };
    }

    /**
     * A racer's actions, `{ acts: [{ reveal: 12 }, { flag: 30, on: true }, ..] }`, taken in order,
     * answered with their board. None at all just asks for the board. One refused, eg. while they
     * wait after setting off a mine, doesn't stop the rest, and the answer says why.
     */
    act(userId: string, body: unknown): ActOutcome {
        const d = this.data;
        const fail = (error: string, changed = false): ActOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = this.racer(userId);
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
            if (racer.cleared > before) racer.clearedAt = this.now();
            if (racer.cleared === this.size * this.size - this.mines) {
                this.finish("cleared", racer.id, this.now());
            }
        }
        if (changed && d.phase === "active") this.changed();
        if (error !== undefined) return fail(error, changed);
        return { result: { ok: true, own: this.own(userId)! }, changed };
    }

    #apply(racer: Racer, cells: string[], act: unknown): Applied {
        const field = this.field!;
        const parsed = parseAct(act, cells.length);
        if (parsed === undefined) return { changed: false, error: "That isn't an action" };
        const now = this.now();
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

    /** Each racer's own board while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnBoard> | undefined {
        if (this.data.phase !== "active") return undefined;
        return Object.fromEntries(this.data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /** What everyone sees: how far each racer's got, and, once it's over, their boards too */
    shared(): SharedState {
        const d = this.data;
        const finished = d.phase === "finished";
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            size: this.size,
            mines: this.mines,
            racers: d.players.map(({ id, cleared, hits, rev, view }) =>
                finished ? { id, cleared, hits, rev, view } : { id, cleared, hits, rev },
            ),
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
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        if (d.winner === undefined) return "The race ended with nobody in it";
        const who = `@UserId(${d.winner})`;
        if (d.ended === "cleared" && d.startedAt !== undefined && d.finishedAt !== undefined) {
            return `${who} cleared the field in ${duration(d.finishedAt - d.startedAt)}`;
        }
        return `Time's up! ${who} cleared the most`;
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
