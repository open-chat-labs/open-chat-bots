// ChatMan's mazes: a grid of tiles, each a wall or a path, mirrored left to right, with no dead
// ends, so there's always a way round a spam bot. Each level has its own maze, from the game's
// seed and the level. It's carved as the maze race's is, by a depth-first walk over a coarse grid
// of cells, but only over the left half, up to the middle column. Each dead end is then opened up
// into a loop, and a few more walls are taken out, before the half is mirrored and the cells and
// the gaps between them become tiles. The spam bots' pen is a room in the middle, below a door only
// they can pass, and ChatMan starts below it. It's integer arithmetic only, so the bot and the page
// build the same maze from the same seed. Built from scratch.
import { seeded } from "../maze/maze";

/** Directions, as numbers, clockwise from up */
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export type Dir = 0 | 1 | 2 | 3;

export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export function reverse(d: Dir): Dir {
    return ((d + 2) & 3) as Dir;
}

/** The coarse cells the maze is carved over, and the tiles they become: a cell, then a gap */
export const COLS = 9;
export const ROWS = 10;
export const WIDTH = 2 * COLS + 1;
export const HEIGHT = 2 * ROWS + 1;

/** What a tile is */
export const WALL = 0;
export const PATH = 1;
/** The pen's door, which only a spam bot leaving the pen goes through */
export const DOOR = 2;
/** The pen, where the spam bots wait their turn */
export const PEN = 3;

/** Where ChatMan starts each life: the middle of the row below the pen */
export const START = { x: COLS, y: 15 };
/** The tile above the door, which a spam bot leaving the pen makes for */
export const OUTSIDE = { x: COLS, y: 7 };
/** Where each spam bot waits in the pen */
export const PEN_TILES: readonly { x: number; y: number }[] = [
    { x: COLS, y: 9 },
    { x: COLS - 1, y: 9 },
    { x: COLS + 1, y: 9 },
    { x: COLS - 2, y: 9 },
];
/** The power pellets, in the cells nearest the corners */
const PELLETS: readonly { x: number; y: number }[] = [
    { x: 1, y: 3 },
    { x: WIDTH - 2, y: 3 },
    { x: 1, y: HEIGHT - 4 },
    { x: WIDTH - 2, y: HEIGHT - 4 },
];

/** What's on a tile at the start of a level */
export const DOT = 1;
export const PELLET = 2;

export type ChatMaze = {
    level: number;
    /** Each tile, by row from the top, then column */
    tiles: Uint8Array;
    /** What each tile starts the level with: nothing, a dot or a power pellet */
    food: Uint8Array;
    /** The tiles with food, in order, which a board's dots are packed against */
    foodTiles: number[];
};

// The cells' openings while it's carved, as the maze race's bits are
const OPEN_UP = 1;
const OPEN_RIGHT = 2;
const OPEN_DOWN = 4;
const OPEN_LEFT = 8;
const BITS = [OPEN_UP, OPEN_RIGHT, OPEN_DOWN, OPEN_LEFT];
const OPPOSITE: Record<number, number> = {
    [OPEN_UP]: OPEN_DOWN,
    [OPEN_RIGHT]: OPEN_LEFT,
    [OPEN_DOWN]: OPEN_UP,
    [OPEN_LEFT]: OPEN_RIGHT,
};

/** The half that's carved: the left columns and the middle one, which the mirror runs down */
const HALF = (COLS + 1) / 2;
const MID = HALF - 1;
/** The pen's row of cells, and ChatMan's */
const PEN_ROW = 4;
const START_ROW = 7;
/** Walls taken out at random once there are no dead ends, for more ways round */
const EXTRA_LOOPS = 3;

/** The seed of a level's maze: the game's seed, mixed with the level */
export function levelSeed(seed: number, level: number): number {
    return (seed ^ Math.imul(level, 0x9e3779b1)) >>> 0;
}

function isPen(x: number, y: number): boolean {
    return y === PEN_ROW && x >= MID - 1;
}

/** The level's maze, from the game's seed */
export function chatMaze(seed: number, level: number): ChatMaze {
    const next = seeded(levelSeed(seed, level));
    const open = new Uint8Array(HALF * ROWS);
    const at = (x: number, y: number) => y * HALF + x;
    /** The cell next to (x, y) the way of `bit`, if it's in the half and not the pen */
    const neighbour = (x: number, y: number, bit: number) => {
        const d = BITS.indexOf(bit);
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx > MID || ny >= ROWS || isPen(nx, ny)) return undefined;
        // The middle column's way right crosses the mirror, to its own reflection
        if (x === MID && bit === OPEN_RIGHT) return undefined;
        return { x: nx, y: ny };
    };
    const join = (x: number, y: number, bit: number) => {
        const to = neighbour(x, y, bit)!;
        open[at(x, y)] |= bit;
        open[at(to.x, to.y)] |= OPPOSITE[bit];
    };

    // A depth-first walk from the top-left cell, taking a random way on at each step
    const visited = new Uint8Array(HALF * ROWS);
    const stack = [{ x: 0, y: 0 }];
    visited[0] = 1;
    while (stack.length > 0) {
        const { x, y } = stack[stack.length - 1];
        const ways = BITS.filter((bit) => {
            const to = neighbour(x, y, bit);
            return to !== undefined && visited[at(to.x, to.y)] === 0;
        });
        if (ways.length === 0) {
            stack.pop();
            continue;
        }
        const bit = ways[next() % ways.length];
        join(x, y, bit);
        const to = neighbour(x, y, bit)!;
        visited[at(to.x, to.y)] = 1;
        stack.push(to);
    }

    // ChatMan starts heading left, so his row's open both ways from the middle
    if ((open[at(MID, START_ROW)] & OPEN_LEFT) === 0) join(MID, START_ROW, OPEN_LEFT);

    // Every dead end becomes part of a loop: a middle cell's way left is its way right too
    const ways = (x: number, y: number) => {
        const o = open[at(x, y)];
        let n = 0;
        for (const bit of BITS) if ((o & bit) !== 0) n++;
        return x === MID && (o & OPEN_LEFT) !== 0 ? n + 1 : n;
    };
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x <= MID; x++) {
            if (isPen(x, y) || ways(x, y) !== 1) continue;
            const closed = BITS.filter(
                (bit) => (open[at(x, y)] & bit) === 0 && neighbour(x, y, bit) !== undefined,
            );
            // Into another dead end if there's one, which mends both
            const deadEnds = closed.filter((bit) => {
                const to = neighbour(x, y, bit)!;
                return ways(to.x, to.y) === 1;
            });
            const choices = deadEnds.length > 0 ? deadEnds : closed;
            join(x, y, choices[next() % choices.length]);
        }
    }
    for (let i = 0, tries = 0; i < EXTRA_LOOPS && tries < 50; tries++) {
        const x = next() % HALF;
        const y = next() % ROWS;
        const bit = BITS[next() % 4];
        if (isPen(x, y) || (open[at(x, y)] & bit) !== 0 || neighbour(x, y, bit) === undefined) {
            continue;
        }
        join(x, y, bit);
        i++;
    }

    // The cells, mirrored, become tiles: a cell's tile, and the gap to its right and below
    const tiles = new Uint8Array(WIDTH * HEIGHT);
    for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
            const hx = cx <= MID ? cx : COLS - 1 - cx;
            let o = open[at(hx, cy)];
            if (cx > MID) {
                o = (o & (OPEN_UP | OPEN_DOWN)) | (o & OPEN_LEFT ? OPEN_RIGHT : 0) | (o & OPEN_RIGHT ? OPEN_LEFT : 0);
            } else if (cx === MID && (o & OPEN_LEFT) !== 0) {
                o |= OPEN_RIGHT;
            }
            const tx = 2 * cx + 1;
            const ty = 2 * cy + 1;
            tiles[ty * WIDTH + tx] = PATH;
            if ((o & OPEN_RIGHT) !== 0) tiles[ty * WIDTH + tx + 1] = PATH;
            if ((o & OPEN_DOWN) !== 0) tiles[(ty + 1) * WIDTH + tx] = PATH;
        }
    }
    // The pen: its row of three cells and the gaps between them, and the door above its middle
    for (let x = 2 * (MID - 1) + 1; x <= 2 * (MID + 1) + 1; x++) {
        tiles[(2 * PEN_ROW + 1) * WIDTH + x] = PEN;
    }
    tiles[(OUTSIDE.y + 1) * WIDTH + OUTSIDE.x] = DOOR;

    // A dot on every path but ChatMan's start, and the pellets near the corners
    const food = new Uint8Array(WIDTH * HEIGHT);
    const foodTiles: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === PATH && i !== START.y * WIDTH + START.x) food[i] = DOT;
    }
    for (const { x, y } of PELLETS) food[y * WIDTH + x] = PELLET;
    for (let i = 0; i < food.length; i++) if (food[i] !== 0) foodTiles.push(i);
    return { level, tiles, food, foodTiles };
}

export function tileAt(maze: ChatMaze, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return WALL;
    return maze.tiles[y * WIDTH + x];
}
