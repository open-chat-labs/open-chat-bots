// The maze race's shared state, as the bot publishes it through the MiniApp service, and sends
// each racer over the live socket (`live.ts`), and the page reads. Everything is shared: everyone
// sees where everyone is. The maze itself isn't in it, only its seed, which the page carves the
// maze from (`maze.ts`). `rev` goes up with every change, so the page can tell which of a state
// from the service and one from the socket is the newer.
import type { Settings } from "../settings";
import type { Direction } from "./maze";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "maze";

/** The most racers: each one's moves go to every other, live */
export const MAX_PLAYERS = 10;

export type Phase = "open" | "active" | "finished";

/** How a race ended: someone got out, or the time ran out and the closest to the way out won */
export type Ending = "out" | "time";

export type Seat = { id: string; name: string };

export type RacerState = {
    id: string;
    x: number;
    y: number;
    /** The number of the racer's last move the bot has taken, so their page can replay the rest */
    ack: number;
    /** How many moves they've made */
    moves: number;
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id: the maze's size and the minutes */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    /** The racers' names by id, as they joined */
    names: Record<string, string>;
    /** Cells along each side */
    size: number;
    /** What the maze is carved from, once the race has started */
    seed?: number;
    racers: RacerState[];
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    rev: number;
};

/** A racer's move, over the socket or `POST /api/maze/move`: `n` counts their moves from 1 */
export type MoveMessage = { move: Direction; n: number };
