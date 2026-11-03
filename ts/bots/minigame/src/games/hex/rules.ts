// Hex as a duel: its id, its settings, its board, and how it says the board ended the game. The bot
// and the page share it: the page replays the moves, each a cell's name, eg. "e5", or "swap", on a
// board of the size the settings say, to draw it.
import { FIRST_SETTING, minutesSetting } from "../duel/settings";
import type { DuelRules } from "../duel/types";
import type { SettingSpec } from "../settings";
import { CELL_NAME, HexBoard, SWAP } from "./board";

export const GAME_ID = "hex";

/** Bumped when the state's shape changes, so a page left open from an older release reloads */
export const STATE_VERSION = 1;

/** Each player's time for the whole game unless set: a game on 9 by 9 is 20 moves each, or so */
export const MINUTES = 5;

/** How many cells a side the board has unless set: 11 is the classic board, 9 a quick one */
export const SIZE = 9;

export const SIZE_SETTING: SettingSpec = {
    id: "size",
    label: "Board",
    choices: [9, 11, 13].map((value) => ({ value, label: `${value} by ${value}` })),
    default: SIZE,
};

export const HEX: DuelRules<string, HexBoard> = {
    kind: GAME_ID,
    title: "Hex",
    version: STATE_VERSION,
    settings: [FIRST_SETTING, SIZE_SETTING, minutesSetting([2, 3, 5, 10, 15], MINUTES)],
    start: (settings) => new HexBoard(settings.size ?? SIZE),
    // A cell's name, which the board checks is on it, or the swap
    parseMove: (raw) =>
        typeof raw === "string" && (raw === SWAP || CELL_NAME.test(raw)) ? raw : undefined,
    describeBoard: (winner, _board, name) => {
        if (winner === null) return "Draw";
        return winner === 0
            ? `${name(winner)} joined the top and bottom`
            : `${name(winner)} joined the left and right`;
    },
    lobbyText: (settings) => {
        const size = settings.size ?? SIZE;
        return `Join your two edges of a <strong>${size} by ${size}</strong> board with a chain of
            your stones, before your opponent joins theirs. The second player can swap instead of
            putting down their first stone, and take the first player's.`;
    },
};
