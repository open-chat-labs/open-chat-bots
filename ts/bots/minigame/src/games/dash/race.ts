// The Dash Race: up to twenty racers run the same course, each with their own runner, which sets
// off with everyone else's on a count of three, runs by itself, and jumps when they press, higher
// the longer they hold. The first across the finish
// line wins, or, when the time's up, whoever got furthest, then whoever got there first. A
// racer's run is the ticks their button went down and came up (`runner.ts`), which their page
// plays as they press and sends to the bot as it goes, whole: the bot plays it too, so it knows
// how far they've got, which everyone sees, and that they did. A racer's run comes to them alone,
// in the answers to their requests: it isn't in a private part of the state, as the page has to
// ask the bot as it opens anyway, for the bot's clock, and every racer's run would go with every
// state.
import { jsonBytes, MAX_END_STATE_BYTES, type Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
import { buildCourse, percentOf, pickSections, TILE, type Course } from "./course";
import { describeResult } from "./result";
import { isChanges, runTo, START_TICK, startRunner, TICKS_PER_SECOND, type Runner } from "./runner";
import { DASH_SETTINGS } from "./settings";
import {
    AHEAD_TICKS,
    GAME_ID,
    MAX_CHANGES,
    MAX_PLAYERS,
    STATE_VERSION,
    type Ending,
    type OwnRun,
    type RacerState,
    type RunResponse,
    type SharedState,
} from "./types";

export type Racer = Seat & {
    /** Their run as the bot has it: the ticks their button changed, and the tick it's run to */
    changes: number[];
    upTo: number;
    /** The furthest their runner's been, and the tick it got there, which breaks a tie */
    furthest: number;
    furthestAt: number;
    falls: number;
    /** The tick they crossed the finish line */
    finished?: number;
};

export type DashData = RaceData<Racer, Ending> & {
    /** The course's sections, once the race has started */
    sections?: number[];
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type RunOutcome = { result: RunResponse; changed: boolean };

/** How often the bot publishes a change: the standings needn't keep up with every step */
const PUBLISH_EVERY_MS = 500;

export class DashRace extends Race<Racer, Ending, DashData, SharedState> {
    readonly kind = GAME_ID;
    /** The course, built from its sections, and the sections it was built from */
    #course?: { sections: string; course: Course | undefined };
    /** Each racer's runner where the bot last ran it to, so a run's played on from there */
    readonly #runners = new Map<string, Runner>();

    constructor(data: DashData, options: RaceOptions = {}) {
        super({ settings: DASH_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): DashRace {
        return new DashRace(openRace(options), options);
    }

    /** The race's course, once it's started */
    get course(): Course | undefined {
        const sections = this.data.sections;
        if (sections === undefined) return undefined;
        const key = sections.join(",");
        if (this.#course?.sections !== key) {
            this.#course = { sections: key, course: buildCourse(sections) };
        }
        return this.#course.course;
    }

    /** Picks a course, and starts everyone at its start */
    protected begin(seats: readonly Seat[]): Racer[] {
        this.data.sections = pickSections(this.random);
        const start = startRunner(this.course!);
        return seats.map((s) => ({
            ...s,
            changes: [],
            upTo: start.tick,
            furthest: start.furthest,
            furthestAt: start.furthestAt,
            falls: 0,
        }));
    }

    /** Whoever got furthest, then whoever got there first: nobody, if nobody set off */
    protected leader(): string | undefined {
        const [best] = [...this.data.players].sort(
            (a, b) => b.furthest - a.furthest || a.furthestAt - b.furthestAt,
        );
        return best !== undefined && best.furthestAt >= 0 ? best.id : undefined;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    /** The time limit, from when everyone sets off, after the count of three */
    protected lengthMs(): number {
        return super.lengthMs() + (START_TICK * 1000) / TICKS_PER_SECOND;
    }

    /** The race's tick at a time, counted from its start, as the page counts it */
    #tickAt(time: number): number {
        return Math.floor(((time - (this.data.startedAt ?? 0)) * TICKS_PER_SECOND) / 1000);
    }

    #tickNow(): number {
        return this.#tickAt(this.now());
    }

    /** The race's last tick, before the time's up */
    #endTick(): number {
        return this.#tickAt(this.data.endsAt ?? Infinity) - 1;
    }

    /** A racer's own run, which only they see while the race is on */
    own(userId: string): OwnRun | undefined {
        const racer = this.racer(userId);
        return racer === undefined ? undefined : { changes: racer.changes, upTo: racer.upTo };
    }

    /**
     * A racer's run, `{ "changes": [240, 252, 297], "upTo": 320 }`: the ticks their button went
     * down and came up, from the race's start, and the tick their page has played it to, answered
     * with their run as the bot has it. No run at all just asks for it, eg. as the page opens. A
     * run goes on from the one the bot has, with the same changes up to its tick, and no further
     * on than the race is: one that doesn't is refused, whole. Once the race is over, a run
     * changes nothing.
     */
    run(userId: string, body: unknown): RunOutcome {
        const d = this.data;
        const answer = (result: { ok: true } | { ok: false; error: string }): RunResponse =>
            result.ok
                ? { ok: true, own: this.own(userId)!, now: this.now() }
                : { ...result, own: this.own(userId), now: this.now() };
        const fail = (error: string): RunOutcome => ({
            result: answer({ ok: false, error }),
            changed: false,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = this.racer(userId);
        if (racer === undefined) return fail("You aren't in this race");
        const { changes, upTo } = (body ?? {}) as { changes?: unknown; upTo?: unknown };
        // A run sent as the race ended, which a page sends by itself, is only too late
        if (changes === undefined || d.phase === "finished") {
            return { result: answer({ ok: true }), changed: false };
        }
        if (!isChanges(changes, MAX_CHANGES) || !Number.isSafeInteger(upTo)) {
            return fail(`A run is up to ${MAX_CHANGES} ticks, in order, and the tick it's run to`);
        }
        const to = upTo as number;
        if (changes.length > 0 && changes[changes.length - 1] > to) {
            return fail("That run has a change after its tick");
        }
        if (to < racer.upTo || !goesOn(changes, racer)) {
            return fail("That isn't how your run went");
        }
        if (to > Math.min(this.#tickNow() + AHEAD_TICKS, this.#endTick())) {
            return fail("That run is ahead of the race");
        }
        const course = this.course;
        if (course === undefined) return fail("This race's course can't be built");

        const cached = this.#runners.get(racer.id);
        const runner =
            cached !== undefined && cached.tick === racer.upTo
                ? { ...cached }
                : startRunner(course);
        runTo(course, runner, changes, to);
        const tiles = (r: { furthest: number }) => Math.floor(r.furthest / TILE);
        const changed =
            tiles(runner) !== tiles(racer) ||
            runner.falls !== racer.falls ||
            runner.finished !== undefined;
        racer.changes = changes;
        racer.upTo = to;
        racer.furthest = runner.furthest;
        racer.furthestAt = runner.furthestAt;
        racer.falls = runner.falls;
        racer.finished = runner.finished;
        this.#runners.set(racer.id, runner);
        if (runner.finished !== undefined) {
            const at = (d.startedAt ?? 0) + ((runner.finished + 1) * 1000) / TICKS_PER_SECOND;
            this.finish("flag", racer.id, Math.round(at));
        } else if (changed) {
            this.changed();
        }
        return { result: answer({ ok: true }), changed };
    }

    /** What everyone sees: how far each racer's got, and once it's over, the winner's run */
    shared(): SharedState {
        const d = this.data;
        const state: SharedState = {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            sections: d.sections,
            racers: d.players.map((p) => {
                const racer: RacerState = {
                    id: p.id,
                    tiles: Math.floor(p.furthest / TILE),
                    falls: p.falls,
                };
                if (p.finished !== undefined) racer.finished = p.finished;
                return racer;
            }),
            rev: d.rev,
        };
        const winner = d.players.find((p) => p.id === d.winner);
        if (d.phase === "finished" && winner !== undefined) {
            // The run's ticks to the finish, if they fit in the card's end state
            const changes = winner.changes.filter((c) => c <= (winner.finished ?? winner.upTo));
            const withRun = { ...state, changes };
            if (jsonBytes(withRun) <= MAX_END_STATE_BYTES) return withRun;
        }
        return state;
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) reached the flag in 41.3s, with 2
     * falls", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        const winner = d.players.find((p) => p.id === d.winner);
        const course = this.course;
        const percent = (p: Racer) =>
            course === undefined ? 0 : percentOf(course, Math.floor(p.furthest / TILE));
        return describeResult(
            d,
            winner && { ...winner, percent: percent(winner) },
            (id) => `@UserId(${id})`,
        );
    }
}

/** Whether a run goes on from the racer's: the same changes, up to the tick theirs is run to */
function goesOn(changes: readonly number[], racer: Racer): boolean {
    const before = changes.filter((c) => c <= racer.upTo);
    return before.length === racer.changes.length && before.every((c, i) => c === racer.changes[i]);
}
