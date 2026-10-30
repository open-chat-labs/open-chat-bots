// Chess's shared state, as the bot publishes it through the MiniApp service and the app reads it,
// and its end state, which the card keeps. Nothing's private: both sides and every spectator see
// the same. The shapes are the Rust ChessBot's, with the players' names added, as this bot looks
// them up.

/** Bumped when the shape changes, so an app left open from an older release knows to reload */
export const STATE_VERSION = 1;

export const GAME_ID = "chess";

/** Each side's time for the whole game, with no increment */
export const TIME_PER_SIDE_MS = 10 * 60 * 1000;

export type Side = "white" | "black";

/** As the Rust bot names the phases */
export type Status = "Open" | "Active" | "Finished";

export type LastMove = { from: string; to: string };

export type ClockSnapshot = {
    /**
     * When the snapshot was taken, by the bot's clock. The app counts the running side's clock down
     * from it, since a state can reach the app long after it was published: the service sends the
     * latest state to whoever opens the game.
     */
    at: number;
    /** What each side has left, at the time of the snapshot */
    white_ms: number;
    black_ms: number;
    /** Whose clock is running, if the game's on */
    running: Side | null;
};

/** The board, once the game has started */
export type Snapshot = {
    fen: string;
    /** Whose move it is. Once the game's over, whose move it would have been. */
    turn: Side;
    /** Every move so far, in standard algebraic notation, eg. "Nf3", "O-O", "e8=Q+" */
    moves: string[];
    last_move: LastMove | null;
    /** Whether the side to move is in check */
    check: boolean;
    /** The side to move's moves, as UCI, so the app can show them, or none once the game's over */
    legal_moves: string[];
    clock: ClockSnapshot;
    draw_offer: Side | null;
    result: string | null;
};

export type SharedState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    status: Status;
    /** Who's joined, in order. Once the game starts: White, then Black. */
    players: string[];
    /** Each player's name, by user id */
    names: Record<string, string>;
    white: string | null;
    black: string | null;
} & Partial<Snapshot>;

/**
 * How a game ended, as the card keeps it: the result, who played, the moves, and the position
 * before the first and after each, so the app can step through the game. If the whole game won't
 * fit in what the service takes, only the final position is kept, and `truncated` says so.
 */
export type EndState = {
    version: typeof STATE_VERSION;
    game: typeof GAME_ID;
    result: string;
    white: string;
    black: string;
    names: Record<string, string>;
    /** In standard algebraic notation, as the state's */
    moves: string[];
    /** One more than `moves`, the last being the final position, or only the final position if `truncated` */
    fens: string[];
    last_move: LastMove | null;
    truncated?: true;
};

/** The bot's answer to a player's move, resignation or draw offer */
export type ActionResponse = { ok: true; shared: SharedState } | { ok: false; error: string };
