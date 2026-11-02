// ChatMan's shared state, as the bot publishes it through the MiniApp service, and sends each
// player over the live socket (`live.ts`), and the page reads. Every player's board is in it as the
// bot has it, a little behind the game's clock (`LAG_TICKS`), with the turns the bot has had but
// hasn't reached yet, so the page can play anyone's board on to now: its own from its own turns,
// at once, and everyone else's from what the bot has had of theirs. `now` is the bot's clock as it
// sent the state, which the page keeps its own in step with. `rev` goes up with every change, so the
// page can tell which of a state from the service and one from the socket is the newer.
import type { Direction } from "../maze/maze";
import type { Settings } from "../settings";
import type { Dir } from "./maze";
import type { PackedBoard } from "./rules";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "chatman";

/** The most players: each one's turns go to every other, live */
export const MAX_PLAYERS = 10;

/** The countdown between the start and the boards moving */
export const COUNTDOWN_MS = 3000;

/**
 * How far behind the game's clock the bot plays each board, in ticks: a turn taken on the page has
 * this long to reach the bot before it's late, when the bot takes it as soon as it can instead
 */
export const LAG_TICKS = 10;

/** The furthest ahead of the bot's clock a turn can be, for a page whose clock runs fast */
export const AHEAD_TICKS = 40;

/** The most turns the bot holds for a player before it's reached them */
export const MAX_QUEUE = 32;

export type Phase = "open" | "active" | "finished";

/** How a game ended: everyone was out of lives, or the time ran out */
export type Ending = "out" | "time";

export type Seat = { id: string; name: string };

export type PlayerState = {
    id: string;
    /** The number of the player's last turn the bot has had, taken or not */
    ack: number;
    board: PackedBoard;
    /** The turns the bot has had but not reached: each one's number, tick and way */
    queue: [number, number, Dir][];
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    /** The settings as they stand, by id: the minutes and the lives */
    settings: Settings;
    host?: string;
    hostName?: string;
    seats: Seat[];
    /** The players' names by id, as they joined */
    names: Record<string, string>;
    /** What the mazes are built from, once the game has started */
    seed?: number;
    startedAt?: number;
    /** When the boards start moving, after the countdown: their tick 0 */
    playsAt?: number;
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    players: PlayerState[];
    /** The bot's clock as it sent this */
    now: number;
    rev: number;
};

/**
 * A player's turn, over the socket or `POST /api/chatman/turn`: the way, its number, counting from
 * 1, and the tick it was taken at on the page
 */
export type TurnMessage = { turn: Direction; n: number; tick: number };

/** The ways, as `maze.ts` numbers them */
export const DIRECTION_NUMBERS: Readonly<Record<Direction, Dir>> = {
    up: 0,
    right: 1,
    down: 2,
    left: 3,
};
