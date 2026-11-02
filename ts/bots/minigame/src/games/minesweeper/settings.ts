// The Minesweeper race's settings: how big the field is, which sets how many mines, and how long
// the race lasts
import type { SettingSpec } from "../settings";

/**
 * The mines on a field of each size: 9 by 9 is the usual beginner's field, and the bigger two are
 * about as thick with mines as the usual intermediate one
 */
export const MINES: Readonly<Record<number, number>> = { 9: 10, 12: 22, 16: 40 };

export const MINESWEEPER_SETTINGS: readonly SettingSpec[] = [
    {
        id: "size",
        label: "Field",
        choices: Object.entries(MINES).map(([size, mines]) => ({
            value: Number(size),
            label: `${size} by ${size}, ${mines} mines`,
        })),
        default: 12,
    },
    {
        id: "minutes",
        label: "Time limit",
        choices: [2, 3, 5, 10].map((value) => ({ value, label: `${value} minutes` })),
        default: 3,
    },
];
