// The 2048 race's shared state, as the bot publishes it through the MiniApp service and the app
// reads it. Everything is shared: a race is more fun when everyone sees every board, and nothing
// in it is secret, so there's no private part.
//
// A race of a hundred is sent to everyone several times a second, so the racers are packed: a
// board is 16 hex digits (`packBoard`), a racer's keys are a letter each, and the names are left
// out of the live state: the app looks the racers' usernames up by id (`GET /api/names`), and the
// end state, which the card keeps for good, carries the names they joined with, for when the bot
// can't say.
import type { Settings } from "../settings";
import type { Board, Direction } from "./engine";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "2048";

/** The tile which wins the race */
export const TARGET = 2048;

/** How long a race lasts if nobody makes the target tile: then the top score of any board wins */
export const TIME_LIMIT_MS = 10 * 60 * 1000;

/** The most players: what a card takes */
export const MAX_PLAYERS = 100;

export type Phase = "open" | "active" | "finished";

/** How a race ended: a player made the target tile, or the time ran out and the top score won */
export type Ending = "target" | "time";

/** Someone who joined, before the game starts */
export type Seat = { id: string; name: string };

/** A racer, as the app sees one: `Racer` unpacked, with their name */
export type PlayerView = {
    id: string;
    name: string;
    board: Board;
    /** This board's score: "Current" on the cards */
    score: number;
    /** The top score of any of their boards, "Top" on the cards, which ranks them and wins when the time's up */
    best: number;
    /** How many times they started a fresh board */
    restarts: number;
    /** Goes up with every move and restart, so the app knows which board is the newer */
    rev: number;
    /** No move changes the board; they can restart */
    dead: boolean;
    won: boolean;
};

/** A racer on the wire: their id, their board packed, and a letter a number */
export type Racer = {
    i: string;
    /** `packBoard` of the board */
    b: string;
    /** The score, "Current" */
    s: number;
    /** The top score, "Top" */
    t: number;
    /** Restarts */
    r: number;
    /** Rev */
    v: number;
    /** Flags: `DEAD`, `WON` */
    f: number;
};

export const DEAD = 1;
export const WON = 2;

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id (`RACE_SETTINGS`): the target tile and the minutes */
    settings: Settings;
    /** Who ran `/play`, and can change the settings while the race is open */
    host?: string;
    /** The host's name, as they may not have joined */
    hostName?: string;
    target: number;
    /** How long the race lasts from its start, in ms, before the top score wins */
    timeLimit: number;
    maxPlayers: number;
    /** Who's joined so far, while the game is open */
    seats: Seat[];
    /** Everyone racing, once it starts, in the order they joined */
    racers: Racer[];
    /** The racers' names by id: only in the end state, which has to stand on its own */
    names?: Record<string, string>;
    startedAt?: number;
    /** When the race ends if nobody makes the target tile, once started */
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    /** The winner's user id */
    winner?: string;
    lastMove?: { player: string; direction: Direction };
};

/** The bot's answer to a player's move or restart */
export type MoveResponse =
    | {
          ok: true;
          player: PlayerView;
          /** Points this move gained */
          gained: number;
          /** False when the move changed nothing, so nothing was spawned */
          moved: boolean;
          phase: Phase;
      }
    | { ok: false; error: string };
