// The Dash Race's settings: how long the race lasts. There's no choosing how hard the course is,
// as every course is easy at first, then medium, then hard
import type { SettingSpec } from "../settings";

export const DASH_SETTINGS: readonly SettingSpec[] = [
    {
        id: "minutes",
        label: "Time limit",
        choices: [2, 3, 5].map((value) => ({ value, label: `${value} minutes` })),
        default: 3,
    },
];
