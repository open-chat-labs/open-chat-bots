// Reversi as a duel: its id, its settings, its board, and how it says the board ended the game,
// with the count. The bot and the page share it: the page replays the moves, each a square's
// name, eg. "d3", to draw the board.
import { FIRST_SETTING, minutesSetting } from "../duel/settings";
import type { DuelRules } from "../duel/types";
import { Board } from "./board";

export const GAME_ID = "reversi";

/** Bumped when the state's shape changes, so a page left open from an older release reloads */
export const STATE_VERSION = 1;

/** Each player's time for the whole game unless set: a game is 30 moves each, give or take */
export const MINUTES = 5;

export const REVERSI: DuelRules<string, Board> = {
    kind: GAME_ID,
    title: "Reversi",
    version: STATE_VERSION,
    settings: [FIRST_SETTING, minutesSetting([1, 2, 3, 5, 10, 15, 20], MINUTES)],
    start: () => new Board(),
    parseMove: (raw) => (typeof raw === "string" && /^[a-h][1-8]$/.test(raw) ? raw : undefined),
    describeBoard: (winner, board, name) => {
        if (winner === null) return `Draw, ${board.count(0)} discs each`;
        const loser = winner === 0 ? 1 : 0;
        return `${name(winner)} won ${board.count(winner)} to ${board.count(loser)}`;
    },
};
