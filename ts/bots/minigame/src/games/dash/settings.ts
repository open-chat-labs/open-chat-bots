// The Dash Race's settings: how hard the course's sections are, and how long the race lasts
import type { SettingSpec } from "../settings";

export const EASY = 1;
export const MEDIUM = 2;
export const HARD = 3;

export const DASH_SETTINGS: readonly SettingSpec[] = [
    {
        id: "difficulty",
        label: "Course",
        choices: [
            { value: EASY, label: "Easy" },
            { value: MEDIUM, label: "Medium" },
            { value: HARD, label: "Hard" },
        ],
        default: MEDIUM,
    },
    {
        id: "minutes",
        label: "Time limit",
        choices: [2, 3, 5].map((value) => ({ value, label: `${value} minutes` })),
        default: 3,
    },
];
