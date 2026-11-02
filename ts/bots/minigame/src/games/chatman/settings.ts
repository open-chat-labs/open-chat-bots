// ChatMan's settings: how long a game lasts, and how many lives each player has
import type { SettingSpec } from "../settings";

export const CHATMAN_SETTINGS: readonly SettingSpec[] = [
    {
        id: "minutes",
        label: "Time limit",
        choices: [1, 2, 3, 5, 10].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: 3,
    },
    {
        id: "lives",
        label: "Lives",
        choices: [1, 3, 5].map((value) => ({
            value,
            label: `${value} li${value === 1 ? "fe" : "ves"}`,
        })),
        default: 3,
    },
];
