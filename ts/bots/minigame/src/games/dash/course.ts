// A Dash Race's course: a strip of tiles ten high, which everyone runs from left to right. It's
// made of sections (`sections.ts`), a run of obstacles each, picked as the race starts and joined
// end to end between a flat start and a flat finish. Every section starts and ends on the same
// flat ground, so any can follow any. Some of the joins have a checkpoint, where a runner who
// falls starts again, and the course gets harder at the first two: easy to the first, medium to
// the second, then hard the rest of the way.
import { SECTIONS, type Section } from "./sections";

/** A tile's width and height, in the units the runner's moves are counted in */
export const TILE = 256;

/** The course's height in tiles: what the page shows, from the bottom of the ground up */
export const ROWS = 10;

/** The ground's height in tiles, where every section starts and ends, and the checkpoints are */
export const GROUND_ROWS = 2;

export const AIR = 0;
export const SOLID = 1;
/** A spike on the floor, pointing up, or hanging from a ceiling, pointing down */
export const SPIKE_UP = 2;
export const SPIKE_DOWN = 3;

export type Tile = typeof AIR | typeof SOLID | typeof SPIKE_UP | typeof SPIKE_DOWN;

/** How many sections are between checkpoints */
export const CHECKPOINT_EVERY = 4;

/** The level of each stretch between checkpoints, from the start: easy, medium, then hard */
export const STRETCH_LEVELS: readonly number[] = [1, 2, 3, 3, 3];
export const SECTIONS_PER_COURSE = STRETCH_LEVELS.length * CHECKPOINT_EVERY;

/** The flat ground before the first section, and after the last, with the finish line on it */
const START_COLUMNS = 6;
const FINISH_COLUMNS = 8;
const FINISH_AT = 2;

export type Course = {
    /** The sections, as the race picked them, by their place in `SECTIONS` */
    sections: readonly number[];
    /** Its width in tiles */
    width: number;
    /** Every tile, a column at a time from the left, each from the bottom up */
    tiles: Uint8Array;
    /** The columns a runner starts from: the start, then each checkpoint */
    checkpoints: readonly number[];
    /** The column of the finish line: a runner whose left side reaches it has finished */
    finish: number;
};

/** How far through the course a runner `tiles` from its start is, as a whole percentage */
export function percentOf(course: Course, tiles: number): number {
    return Math.min(100, Math.floor((100 * tiles) / course.finish));
}

/** The tile in a column, counted from the left, and a row, from the bottom: air outside the course */
export function tileAt(course: Course, column: number, row: number): Tile {
    if (column < 0 || column >= course.width || row < 0 || row >= ROWS) return AIR;
    return course.tiles[column * ROWS + row] as Tile;
}

const CHARS: Readonly<Record<string, Tile>> = {
    ".": AIR,
    "#": SOLID,
    "^": SPIKE_UP,
    v: SPIKE_DOWN,
};

/**
 * Rows of tiles drawn as a section's are, the top row first, a column at a time, each from the
 * bottom up, or why they can't be read
 */
export function readRows(rows: readonly string[]): { columns: Tile[][] } | { error: string } {
    const width = rows[0]?.length ?? 0;
    if (rows.length === 0 || rows.length > ROWS) return { error: `${rows.length} rows` };
    if (rows.some((row) => row.length !== width)) return { error: "rows of different lengths" };
    const columns: Tile[][] = [];
    for (let x = 0; x < width; x++) {
        const column: Tile[] = [];
        for (let row = 0; row < ROWS; row++) {
            const char = rows[rows.length - 1 - row]?.[x] ?? ".";
            const tile = CHARS[char];
            if (tile === undefined) return { error: `"${char}" in column ${x}` };
            column.push(tile);
        }
        columns.push(column);
    }
    return { columns };
}

/** A section's tiles, a column at a time, or why they can't be read, or don't start and end flat */
export function readSection(section: Section): { columns: Tile[][] } | { error: string } {
    const read = readRows(section.rows);
    if ("error" in read) return read;
    const { columns } = read;
    // Flat ground at each end, so any section can follow any other
    for (const x of [0, 1, columns.length - 2, columns.length - 1]) {
        if (columns[x]?.some((tile, row) => tile !== (row < GROUND_ROWS ? SOLID : AIR)) !== false) {
            return { error: `column ${x} isn't flat ground` };
        }
    }
    return read;
}

function flat(): Tile[] {
    return Array.from({ length: ROWS }, (_, row) => (row < GROUND_ROWS ? SOLID : AIR));
}

/** The course from its sections, by their place in `SECTIONS`, or undefined if one isn't one */
export function buildCourse(sections: readonly number[]): Course | undefined {
    const columns: Tile[][] = Array.from({ length: START_COLUMNS }, flat);
    const checkpoints = [1];
    for (const [i, id] of sections.entries()) {
        const section = SECTIONS[id];
        const read = section === undefined ? undefined : readSection(section);
        if (read === undefined || "error" in read) return undefined;
        if (i > 0 && i % CHECKPOINT_EVERY === 0) checkpoints.push(columns.length);
        columns.push(...read.columns);
    }
    const finish = columns.length + FINISH_AT;
    columns.push(...Array.from({ length: FINISH_COLUMNS }, flat));
    const tiles = new Uint8Array(columns.length * ROWS);
    columns.forEach((column, x) => tiles.set(column, x * ROWS));
    return { sections, width: columns.length, tiles, checkpoints, finish };
}

/**
 * Picks a course's sections: a stretch of easy ones, then medium, then hard, each the next few of
 * its level's in a random order, so no section comes round twice
 */
export function pickSections(random: () => number): number[] {
    const levels = new Map<number, number[]>();
    return STRETCH_LEVELS.flatMap((level) => {
        if (!levels.has(level)) levels.set(level, shuffled(level, random));
        return levels.get(level)!.splice(0, CHECKPOINT_EVERY);
    });
}

/** The sections of a level, in a random order */
function shuffled(level: number, random: () => number): number[] {
    const ids = SECTIONS.flatMap((s, id) => (s.level === level ? [id] : []));
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
}
