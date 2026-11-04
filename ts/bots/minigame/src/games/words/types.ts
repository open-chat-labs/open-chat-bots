// The Word Race's shared state, as the bot publishes it through the MiniApp service and the page
// reads. Everyone races to guess the same word, so while the race is on the state says only how
// each racer's guesses were marked, without their letters, which would give the word away. Each
// racer's own guesses come to them alone, in the answer to their requests (`POST /api/words/guess`)
// and in their private part of each state. Once the race is over, the state has every guess, and
// the word.
import type { Phase, Seat } from "../game";
import type { Settings } from "../settings";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "words";

/** The most racers, as everyone's marks are drawn under the racer's own guesses */
export const MAX_PLAYERS = 20;

/** The letters in the word */
export const LENGTH = 5;

/** The guesses each racer has */
export const TRIES = 6;

/**
 * How a guess's letters are marked, a character a letter: in the word in that place, in the word
 * in another place, or not in the word, or not as many times as the guess has it
 */
export const HIT = "2";
export const NEAR = "1";
export const MISS = "0";

/** A guess's marks, eg. "20110" */
export type Marks = string;

/**
 * How a race ended: someone guessed the word, or the time ran out, or everyone had all their
 * guesses, and whoever came closest won
 */
export type Ending = "guessed" | "time" | "out";

export type RacerState = {
    id: string;
    /** Each guess's marks, in order */
    marks: Marks[];
    /** Their guesses, once the race is over */
    guesses?: string[];
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id: the minutes */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    /** The racers' names by id, as they joined */
    names: Record<string, string>;
    racers: RacerState[];
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    /** The word, once the race is over */
    word?: string;
    rev: number;
};

/** A racer's own guesses, with their marks, which only they get while the race is on */
export type OwnGuesses = { guesses: string[]; marks: Marks[] };

/**
 * The answer to `POST /api/words/guess`: the racer's guesses, the new one included unless it was
 * refused, when the answer says why
 */
export type GuessResponse =
    | { ok: true; own: OwnGuesses }
    | { ok: false; error: string; own?: OwnGuesses };
