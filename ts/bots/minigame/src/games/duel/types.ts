// A duel: a game for two who take turns, each with a clock for the whole game, such as Four in a
// Row. This is what every duel shares with the page. The board isn't in it: the page replays the
// moves with the game's own rules, which it shares with the bot, so a state stays small and a
// finished game can be stepped through. Nothing's private: both players and every spectator see
// the same.
import type { GameKind, Phase } from "../game";
import type { SettingSpec, Settings } from "../settings";

/** The player who moves first sits in seat 0, the other in seat 1 */
export type Seat = 0 | 1;

/**
 * How a duel ended. A board ending is the game's own, eg. four in a row, or a full grid with no
 * winner; the rest are any duel's. A game called off has no winner: the seat to move didn't make
 * its first move in time.
 */
export type Ending =
    | { kind: "board"; winner: Seat | null }
    | { kind: "resignation" | "timeout" | "abandonment"; winner: Seat }
    | { kind: "aborted"; seat: Seat };

export type ClockSnapshot = {
    /**
     * When the snapshot was taken, by the bot's clock. The page counts the running clock down from
     * it, as a state can reach the page long after it was published.
     */
    at: number;
    /** What each seat has left at `at` */
    ms: [number, number];
    /** Whose clock is running, while the game's on */
    running: Seat | null;
    /**
     * While the side to move has yet to make its first move, which its clock doesn't run for: how
     * long it has left to make it, at `at`, before the game's called off
     */
    firstMoveMs?: number;
};

export type DuelState<M> = {
    version: number;
    game: GameKind;
    phase: Phase;
    /** Who's joined, in order. Once the game starts, by seat: who moves first, then the other. */
    players: string[];
    /** Each player's name as they joined, and the host's, by user id */
    names: Record<string, string>;
    /** The settings as they stand, by id: who goes first, the minutes */
    settings: Settings;
    /** Who ran `/play`, and can change the settings while the game is open */
    host?: string;
    /** Every move so far, as the game's rules write them */
    moves: M[];
    clock?: ClockSnapshot;
    ending?: Ending;
    startedAt?: number;
    finishedAt?: number;
};

/** The bot's answer to a player's move or resignation */
export type ActionResponse<M> = { ok: true; shared: DuelState<M> } | { ok: false; error: string };

/** A game's board as its rules see it, which the bot and the page both replay from the moves */
export interface Position<M> {
    /** Whose move it is. Once the game's over, the last to move. */
    readonly turn: Seat;
    /** How the board ended the game, once it has: its winner, or null for a draw */
    readonly outcome: { winner: Seat | null } | undefined;
    /** The moves the side to move can make, none once the game's over */
    legalMoves(): M[];
    /** Plays a move for the side to move, giving why not if it can't be played */
    play(move: M): string | undefined;
}

/** What makes a duel one game rather than another: its rules, and how it says how it ended */
export type DuelRules<M, P extends Position<M>> = {
    kind: GameKind;
    title: string;
    /** Bumped when the state's shape changes, so a page left open from an older release reloads */
    version: number;
    /** Who goes first and the minutes, from `duel/settings.ts`, and anything of the game's own */
    settings: readonly SettingSpec[];
    /** The board before any move, as the game's settings make it, eg. Hex's size */
    start: (settings: Settings) => P;
    /** A move from a request's body, or undefined if it isn't one */
    parseMove: (raw: unknown) => M | undefined;
    /** How the board ended the game, eg. "Alice won with four in a row", naming a seat by `name` */
    describeBoard: (winner: Seat | null, position: P, name: (seat: Seat) => string) => string;
    /**
     * What the lobby says of the game before the time and who goes first, as HTML, eg. Hex's
     * board size, which only the host's form shows otherwise
     */
    lobbyText?: (settings: Settings) => string;
};

export function other(seat: Seat): Seat {
    return seat === 0 ? 1 : 0;
}

/** The position after the moves, or an error if one of them can't be played */
export function replay<M, P extends Position<M>>(
    rules: DuelRules<M, P>,
    moves: readonly M[],
    settings: Settings,
): P {
    const position = rules.start(settings);
    moves.forEach((move, i) => {
        const error = position.play(move);
        if (error !== undefined) throw new Error(`Move ${i + 1}, ${String(move)}: ${error}`);
    });
    return position;
}

/** How the game ended, eg. "Alice resigned", with each player named by `name` */
export function describeEnding<M, P extends Position<M>>(
    rules: DuelRules<M, P>,
    ending: Ending,
    position: P,
    name: (seat: Seat) => string,
): string {
    switch (ending.kind) {
        case "board":
            return rules.describeBoard(ending.winner, position, name);
        case "resignation":
            // Said as what happened, as chess says it
            return `${name(other(ending.winner))} resigned`;
        case "timeout":
            return `${name(ending.winner)} won on time`;
        case "abandonment":
            return `${name(other(ending.winner))} left the game`;
        case "aborted":
            return `Called off: ${name(ending.seat)} didn't make a first move`;
    }
}
