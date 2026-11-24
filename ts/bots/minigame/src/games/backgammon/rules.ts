// Backgammon as a duel: its id, its settings, its board, its dice, and how it says the board ended
// the game. The bot and the page share it: the page replays the moves, each a whole turn with its
// dice, eg. "31:8/5,6/5", to draw the board. The bot rolls the dice for each turn, and the state
// carries the roll for the turn to come.
import { FIRST_SETTING, minutesSetting } from "../duel/settings";
import type { DuelRules } from "../duel/types";
import { Backgammon, MOVE, rollDice } from "./board";

export const GAME_ID = "backgammon";

/** Bumped when the state's shape changes, so a page left open from an older release reloads */
export const STATE_VERSION = 1;

/** Each player's time for the whole game unless set: a game is 25 turns each, or so */
export const MINUTES = 10;

export const BACKGAMMON: DuelRules<string, Backgammon> = {
    kind: GAME_ID,
    title: "Backgammon",
    version: STATE_VERSION,
    settings: [FIRST_SETTING, minutesSetting([5, 10, 15, 20], MINUTES)],
    start: () => new Backgammon(),
    // A turn, which the board checks against the dice and the checkers
    parseMove: (raw) => (typeof raw === "string" && MOVE.test(raw) ? raw : undefined),
    describeBoard: (winner, board, name) => {
        if (winner === null) return "Draw";
        const kind = board.outcome?.kind;
        return kind === 3
            ? `${name(winner)} won with a backgammon`
            : kind === 2
              ? `${name(winner)} won with a gammon`
              : `${name(winner)} bore off first and won`;
    },
    lobbyText: () =>
        `Race your 15 checkers round the board and bear them off before your opponent does.
            Land on a lone checker to send it back to the start.`,
    roll: rollDice,
};
