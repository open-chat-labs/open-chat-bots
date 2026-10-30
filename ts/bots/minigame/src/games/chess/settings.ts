// Chess's settings: who plays White, each side's time, and the time added after each move
import type { SettingSpec } from "../settings";
import { TIME_PER_SIDE_MS } from "./types";

/** The `white` setting's choices: who plays White, and moves first */
export const WHITE_RANDOM = 0;
export const WHITE_IS_HOST = 1;
export const WHITE_IS_OPPONENT = 2;

export const CHESS_SETTINGS: readonly SettingSpec[] = [
    {
        id: "white",
        label: "Who plays White",
        description: "Who plays White: random, the host, or the host's opponent",
        choices: [
            { value: WHITE_RANDOM, label: "Random" },
            { value: WHITE_IS_HOST, label: "The host" },
            { value: WHITE_IS_OPPONENT, label: "The host's opponent" },
        ],
        default: WHITE_RANDOM,
    },
    {
        id: "minutes",
        label: "Time limit",
        description: "Minutes each side has for the whole game, 10 unless set",
        choices: [1, 2, 3, 5, 10, 15, 20, 30, 60].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: TIME_PER_SIDE_MS / 60_000,
    },
    {
        id: "increment",
        label: "Added per move",
        description: "Seconds added to a side's clock after each of its moves, none unless set",
        choices: [0, 1, 2, 3, 5, 10, 15, 30].map((value) => ({
            value,
            label: value === 0 ? "None" : `${value} second${value === 1 ? "" : "s"}`,
        })),
        default: 0,
    },
];
