// ChatMan's settings: how long a game lasts, and how many lives each player has
import type { SettingSpec } from "../settings";

export const CHATMAN_SETTINGS: readonly SettingSpec[] = [
    {
        id: "minutes",
        label: "Time limit",
        description: "Minutes until the top score wins, 3 unless set",
        choices: [1, 2, 3, 5, 10].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: 3,
    },
    {
        id: "lives",
        label: "Lives",
        description: "Lives each player has, 3 unless set",
        choices: [1, 3, 5].map((value) => ({
            value,
            label: `${value} li${value === 1 ? "fe" : "ves"}`,
        })),
        default: 3,
    },
];
