// The Word Race's settings: how long the race lasts, should nobody guess the word first
import type { SettingSpec } from "../settings";

export const WORDS_SETTINGS: readonly SettingSpec[] = [
    {
        id: "minutes",
        label: "Time limit",
        choices: [2, 3, 5, 10].map((value) => ({ value, label: `${value} minutes` })),
        default: 3,
    },
];
