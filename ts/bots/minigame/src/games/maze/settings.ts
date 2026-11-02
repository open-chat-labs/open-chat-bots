// The maze race's settings: how big the maze is, and how long the race lasts
import type { SettingSpec } from "../settings";

export const MAZE_SETTINGS: readonly SettingSpec[] = [
    {
        id: "size",
        label: "Maze size",
        description: "Cells along each side of the maze, 15 unless set",
        choices: [11, 15, 21, 25].map((value) => ({ value, label: `${value} by ${value}` })),
        default: 15,
    },
    {
        id: "minutes",
        label: "Time limit",
        description: "Minutes until whoever's closest to the way out wins, 3 unless set",
        choices: [1, 2, 3, 5, 10].map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: 3,
    },
];
