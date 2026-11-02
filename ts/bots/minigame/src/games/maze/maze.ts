// A maze, from a seed: a square of cells with one way between any two of them, carved by a
// depth-first walk ("recursive backtracking") that takes a random turn at each step. Racers start
// in the top-left cell and the way out is the bottom-right one. It's integer arithmetic only, so
// the bot and the page carve the very same maze from the same seed, and a state carries the seed
// rather than the walls. Built from scratch.

/** The openings out of a cell, as bits */
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

export type Direction = "up" | "right" | "down" | "left";

export const DIRECTIONS: Readonly<Record<Direction, { bit: number; dx: number; dy: number }>> = {
    up: { bit: UP, dx: 0, dy: -1 },
    right: { bit: RIGHT, dx: 1, dy: 0 },
    down: { bit: DOWN, dx: 0, dy: 1 },
    left: { bit: LEFT, dx: -1, dy: 0 },
};

const OPPOSITE: Record<number, number> = { [UP]: DOWN, [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT };

export type Maze = {
    size: number;
    /** Each cell's openings, by row from the top, then column */
    open: Uint8Array;
    /** Each cell's steps to the way out, along the maze's one path */
    distance: Uint16Array;
};

/** A source of 32-bit unsigned integers from a seed (mulberry32): the same in any engine */
export function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    };
}

export function isDirection(value: unknown): value is Direction {
    return typeof value === "string" && Object.hasOwn(DIRECTIONS, value);
}

/** The maze a seed carves, `size` cells each way */
export function carve(size: number, seed: number): Maze {
    const next = seeded(seed);
    const open = new Uint8Array(size * size);
    const visited = new Uint8Array(size * size);
    const stack = [0];
    visited[0] = 1;
    while (stack.length > 0) {
        const cell = stack[stack.length - 1];
        const x = cell % size;
        const y = Math.floor(cell / size);
        const ways: { bit: number; to: number }[] = [];
        for (const { bit, dx, dy } of Object.values(DIRECTIONS)) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const to = ny * size + nx;
            if (visited[to] === 0) ways.push({ bit, to });
        }
        if (ways.length === 0) {
            stack.pop();
            continue;
        }
        const { bit, to } = ways[next() % ways.length];
        open[cell] |= bit;
        open[to] |= OPPOSITE[bit];
        visited[to] = 1;
        stack.push(to);
    }
    return { size, open, distance: distances(size, open) };
}

// Steps from every cell to the way out, by a breadth-first walk back from it
function distances(size: number, open: Uint8Array): Uint16Array {
    const distance = new Uint16Array(size * size).fill(0xffff);
    const exit = size * size - 1;
    distance[exit] = 0;
    const queue = [exit];
    for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        const x = cell % size;
        const y = Math.floor(cell / size);
        for (const { bit, dx, dy } of Object.values(DIRECTIONS)) {
            if ((open[cell] & bit) === 0) continue;
            const to = (y + dy) * size + (x + dx);
            if (distance[to] === 0xffff) {
                distance[to] = distance[cell] + 1;
                queue.push(to);
            }
        }
    }
    return distance;
}

/** Whether there's a way out of the cell in the direction */
export function canMove(maze: Maze, x: number, y: number, direction: Direction): boolean {
    if (x < 0 || y < 0 || x >= maze.size || y >= maze.size) return false;
    return (maze.open[y * maze.size + x] & DIRECTIONS[direction].bit) !== 0;
}

/** Steps from the cell to the way out */
export function stepsOut(maze: Maze, x: number, y: number): number {
    return maze.distance[y * maze.size + x];
}

export function isWayOut(maze: Maze, x: number, y: number): boolean {
    return x === maze.size - 1 && y === maze.size - 1;
}

/** The way out from a cell, a direction a step: the maze's one path, always a step closer */
export function wayOut(maze: Maze, fromX = 0, fromY = 0): Direction[] {
    const path: Direction[] = [];
    let x = fromX;
    let y = fromY;
    while (!isWayOut(maze, x, y)) {
        const here = stepsOut(maze, x, y);
        const direction = (Object.keys(DIRECTIONS) as Direction[]).find(
            (d) =>
                canMove(maze, x, y, d) &&
                stepsOut(maze, x + DIRECTIONS[d].dx, y + DIRECTIONS[d].dy) === here - 1,
        )!;
        path.push(direction);
        x += DIRECTIONS[direction].dx;
        y += DIRECTIONS[direction].dy;
    }
    return path;
}
