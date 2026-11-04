// The Minesweeper race's shared state, as the bot publishes it through the MiniApp service and the
// page reads. Everyone races on the same field, so while the race is on the state says only how far
// each racer's got: where they've been would show the others where it's safe. Each racer's own
// board comes to them alone, in the answer to their requests (`POST /api/minesweeper/act`) and in
// their private part of each state. Once the race is over, the state has every board and the mines.
import type { Phase, Seat } from "../game";
import type { Settings } from "../settings";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "minesweeper";

/** The most racers, as the standings are drawn under the field */
export const MAX_PLAYERS = 10;

/** How long a racer who sets off a mine waits before the bot takes anything more from them */
export const PENALTY_MS = 10_000;

/** The most actions in a request: the page sends what was clicked while the last was answered */
export const MAX_ACTS = 32;

/**
 * A board as a racer sees it, a character a cell, by row from the top, then column: `.` hidden,
 * `f` flagged, `0` to `8` open with the mines it touches, `x` a mine they set off
 */
export type View = string;

export const HIDDEN = ".";
export const FLAG = "f";
export const BOOM = "x";

/** How a race ended: someone cleared the field, or the time ran out and the furthest on won */
export type Ending = "cleared" | "time";

export type RacerState = {
    id: string;
    /** Safe cells they've opened */
    cleared: number;
    /** Mines they've set off */
    hits: number;
    /** Goes up with every change to their board, so their page knows when it has an old one */
    rev: number;
    /** Their board, once the race is over */
    view?: View;
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id: the field's size and the minutes */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    /** The racers' names by id, as they joined */
    names: Record<string, string>;
    /** Cells along each side */
    size: number;
    mines: number;
    racers: RacerState[];
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    /** Where the mines are, once the race is over */
    mineCells?: number[];
    rev: number;
};

/**
 * What a racer does: opens a cell, flags one or takes its flag off, or opens every unflagged cell
 * round a number that has as many flags round it as it says
 */
export type Act = { reveal: number } | { flag: number; on: boolean } | { chord: number };

/** A racer's own board, which only they get while the race is on */
export type OwnBoard = {
    view: View;
    rev: number;
    cleared: number;
    hits: number;
    /** How long until they can do anything again, after setting off a mine */
    frozenMs: number;
};

/**
 * The answer to `POST /api/minesweeper/act`: the racer's board after the actions, and, if one was
 * refused, why. A refusal doesn't stop the rest.
 */
export type ActResponse =
    | { ok: true; own: OwnBoard }
    | { ok: false; error: string; own?: OwnBoard };
