// The Crate Race's settings: which of the levels the race's is from, and how long it lasts
import type { SettingSpec } from "../settings";

export const EASY = 1;
export const MEDIUM = 2;
export const HARD = 3;

export const CRATES_SETTINGS: readonly SettingSpec[] = [
    {
        id: "difficulty",
        label: "Level",
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
        choices: [3, 5, 10].map((value) => ({ value, label: `${value} minutes` })),
        default: 5,
    },
];
