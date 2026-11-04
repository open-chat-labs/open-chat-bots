// The Crate Race's shared state, as the bot publishes it through the MiniApp service and the page
// reads. Everyone races on the same level, so while the race is on the state says only how far
// each racer's got, the crates they've put on goals and their pushes: where their crates are would
// show the others how to do it. Each racer's own moves come to them alone, in the answer to their
// requests (`POST /api/crates/path`) and in their private part of each state. Once the race is
// over, the state has where everyone's crates ended up, and the winner's moves.
import type { Phase, Seat } from "../game";
import type { Settings } from "../settings";
import type { LevelCode } from "./board";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "crates";

/** The most racers, as the standings are drawn under the level */
export const MAX_PLAYERS = 20;

/** The most moves a racer's path may have, undoing aside: enough for a wander round any level */
export const MAX_PATH = 2000;

/**
 * How a race ended: someone put every crate on a goal, or the time ran out and whoever had put the
 * most on goals won
 */
export type Ending = "solved" | "time";

export type RacerState = {
    id: string;
    /** Their crates on goals */
    placed: number;
    pushes: number;
    /** Once the race is over: where their crates ended up, in the level's order, and they did */
    crates?: number[];
    player?: number;
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id: the level's difficulty and the minutes */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    /** The racers' names by id, as they joined */
    names: Record<string, string>;
    /** The level everyone's racing on, once the race has started, and the fewest pushes it takes */
    level?: LevelCode;
    par?: number;
    racers: RacerState[];
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    /** The winner's moves, once the race is over, so the page can show how they did it */
    path?: string;
    rev: number;
};

/** A racer's own moves, which only they get while the race is on */
export type OwnPath = { path: string };

/**
 * The answer to `POST /api/crates/path`: the racer's moves as the bot has them, theirs unless they
 * couldn't all be made, when the answer says so
 */
export type PathResponse = { ok: true; own: OwnPath } | { ok: false; error: string; own?: OwnPath };
