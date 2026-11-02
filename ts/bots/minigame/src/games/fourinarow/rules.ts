// Four in a Row as a duel: its id, its settings, its grid, and how it says the grid ended the game.
// The bot and the page share it: the page replays the moves, each a column, to draw the grid.
import { FIRST_SETTING, minutesSetting } from "../duel/settings";
import type { DuelRules } from "../duel/types";
import { COLUMNS, Grid } from "./grid";

export const GAME_ID = "four-in-a-row";

/** Bumped when the state's shape changes, so a page left open from an older release reloads */
export const STATE_VERSION = 1;

/** Each player's time for the whole game unless set: a game is 21 moves each at most */
export const MINUTES = 3;

export const FOUR_IN_A_ROW: DuelRules<number, Grid> = {
    kind: GAME_ID,
    title: "Four in a Row",
    version: STATE_VERSION,
    settings: [FIRST_SETTING, minutesSetting([1, 2, 3, 5, 10], MINUTES)],
    start: () => new Grid(),
    parseMove: (raw) =>
        typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < COLUMNS
            ? raw
            : undefined,
    describeBoard: (winner, _grid, name) =>
        winner === null ? "Draw: the grid is full" : `${name(winner)} won with four in a row`,
};
