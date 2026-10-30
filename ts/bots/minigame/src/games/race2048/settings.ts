// The race's settings: the tile which wins, and how long the race lasts
import type { SettingSpec } from "../settings";
import { TARGET, TIME_LIMIT_MS } from "./types";

export const RACE_SETTINGS: readonly SettingSpec[] = [
    {
        id: "target",
        label: "Winning tile",
        description: "The tile which wins the race, 2048 unless set",
        choices: [256, 512, 1024, 2048, 4096].map((value) => ({ value, label: String(value) })),
        default: TARGET,
    },
    {
        id: "minutes",
        label: "Time limit",
        description: "Minutes until the top score wins, 10 unless set",
        choices: [1, 2, 3, 5, 10, 15, 20, 30].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: TIME_LIMIT_MS / 60_000,
    },
];
