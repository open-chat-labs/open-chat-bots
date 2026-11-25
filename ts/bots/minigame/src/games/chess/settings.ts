// Chess's settings: who the host plays, someone in the chat or the computer at a level, who plays
// White, each side's time, and the time added after each move
import type { SettingSpec, Settings } from "../settings";
import { TIME_PER_SIDE_MS } from "./types";

/** The `opponent` setting: someone in the chat, or the computer at its level, 1 to 8 */
export const OPPONENT_PERSON = 0;
export const COMPUTER_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The computer's level the settings choose, or undefined when the host plays someone */
export function computerLevel(settings: Settings): number | undefined {
    const level = settings.opponent;
    return COMPUTER_LEVELS.includes(level) ? level : undefined;
}

/** What the computer's called at a level, eg. "Computer (level 3)" */
export function computerName(level: number): string {
    return `Computer (level ${level})`;
}

/** The `white` setting's choices: who plays White, and moves first */
export const WHITE_RANDOM = 0;
export const WHITE_IS_HOST = 1;
export const WHITE_IS_OPPONENT = 2;

export const CHESS_SETTINGS: readonly SettingSpec[] = [
    {
        id: "opponent",
        label: "Opponent",
        choices: [
            { value: OPPONENT_PERSON, label: "Someone in the chat" },
            ...COMPUTER_LEVELS.map((level) => ({
                value: level,
                label: `The computer, level ${level}${level === 1 ? " (easiest)" : level === 8 ? " (hardest)" : ""}`,
            })),
        ],
        default: OPPONENT_PERSON,
    },
    {
        id: "white",
        label: "Who plays White",
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
        choices: [1, 2, 3, 5, 10, 15, 20, 30, 60].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: TIME_PER_SIDE_MS / 60_000,
    },
    {
        id: "increment",
        label: "Added per move",
        choices: [0, 1, 2, 3, 5, 10, 15, 30].map((value) => ({
            value,
            label: value === 0 ? "None" : `${value} second${value === 1 ? "" : "s"}`,
        })),
        default: 0,
    },
];
