// The 2048 race's shared state, as the bot publishes it through the MiniApp service and the app
// reads it. Everything is shared: a race is more fun when everyone sees every board, and nothing
// in it is secret, so there's no private part.
import type { Board, Direction } from "./engine";

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "2048";

/** The tile which wins the race */
export const TARGET = 2048;

/** The most players, a 3 by 3 grid of boards */
export const MAX_PLAYERS = 9;

export type Phase = "open" | "active" | "finished";

/** Someone who joined, before the game starts */
export type Seat = { id: string; name: string };

export type PlayerView = {
    id: string;
    name: string;
    board: Board;
    score: number;
    /** Moves on the current board */
    moves: number;
    /** How many times they started a fresh board */
    restarts: number;
    /** Goes up with every move and restart, so the app knows which board is the newer */
    rev: number;
    /** No move changes the board; they can restart */
    dead: boolean;
    won: boolean;
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    phase: Phase;
    target: number;
    maxPlayers: number;
    /** Who's joined so far, while the game is open */
    seats: Seat[];
    /** Everyone racing, once it starts, in the order they joined */
    players: PlayerView[];
    startedAt?: number;
    finishedAt?: number;
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
