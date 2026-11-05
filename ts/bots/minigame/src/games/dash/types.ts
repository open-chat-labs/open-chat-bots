// The Dash Race's shared state, as the bot publishes it through the MiniApp service and the page
// reads. Everyone runs the same course, so while the race is on the state says how far each racer
// has got, and how many times they've fallen: their runs, the ticks their button went down and
// came up, would show the others how to do it. Each racer's own run comes to them alone, in the
// answer to their requests (`POST /api/dash/run`). Once the race is over, the state has the
// winner's run, so the page can show it.
import type { RaceBase } from "../race";

/**
 * Bumped when the shape changes, or how a run's played, so an app left open from an older release
 * knows to reload. In 1, each runner set off on its racer's first press, and times were from the
 * race's start: the page still reads a race that finished then, as it did then.
 */
export const STATE_VERSION = 2;

export const GAME_ID = "dash";

/** The most racers, as the standings are drawn under the course */
export const MAX_PLAYERS = 20;

/** The most times a run's button may go down or come up: ten a second for the longest race */
export const MAX_CHANGES = 3000;

/**
 * How far a run may be ahead of the bot's clock, in ticks, as the page's sense of it isn't exact.
 * A run can't be any further on than that: a run made up ahead can't be sent until it could have
 * been run.
 */
export const AHEAD_TICKS = 30;

/** How a race ended: someone crossed the finish line, or the time ran out */
export type Ending = "flag" | "time";

export type RacerState = {
    id: string;
    /** How far they've got, in tiles from the course's start */
    tiles: number;
    falls: number;
    /** The tick they crossed the finish line, if they did */
    finished?: number;
};

export type SharedState = RaceBase<Ending> & {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    /** The racers' names by id, as they joined */
    names: Record<string, string>;
    /** The course's sections, once the race has started (`course.ts`) */
    sections?: number[];
    racers: RacerState[];
    /** The winner's run, once the race is over, so the page can show how they did it */
    changes?: number[];
    rev: number;
};

/** A racer's own run: the ticks their button went down and came up, and the tick it's been run to */
export type OwnRun = { changes: number[]; upTo: number };

/**
 * The answer to `POST /api/dash/run`: the racer's run as the bot has it, theirs unless it wasn't
 * one the bot could take, when the answer says so, with the bot's clock, so the page can keep to
 * it
 */
export type RunResponse =
    | { ok: true; own: OwnRun; now: number }
    | { ok: false; error: string; own?: OwnRun; now: number };
