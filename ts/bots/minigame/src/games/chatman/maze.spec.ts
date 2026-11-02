import { describe, expect, it } from "vitest";
import {
    chatMaze,
    DOOR,
    DX,
    DY,
    HEIGHT,
    OUTSIDE,
    PATH,
    PELLET,
    PEN,
    PEN_TILES,
    START,
    tileAt,
    WALL,
    WIDTH,
    type ChatMaze,
} from "./maze";

const SEEDS = [1, 12345, 2 ** 31 - 1];
const LEVELS = [1, 2, 3];

function each(test: (maze: ChatMaze) => void) {
    for (const seed of SEEDS) for (const level of LEVELS) test(chatMaze(seed, level));
}

function paths(maze: ChatMaze): number[] {
    return [...maze.tiles.keys()].filter((i) => maze.tiles[i] === PATH);
}

function neighbours(i: number): { x: number; y: number }[] {
    const x = i % WIDTH;
    const y = Math.floor(i / WIDTH);
    return [0, 1, 2, 3].map((d) => ({ x: x + DX[d], y: y + DY[d] }));
}

/** FNV-1a over the tiles, to pin a maze */
function fingerprint(bytes: Uint8Array): number {
    let h = 0x811c9dc5;
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h;
}

describe("ChatMan's mazes", () => {
    it("are walled all round, and the same mirrored left to right", () => {
        each((maze) => {
            for (let y = 0; y < HEIGHT; y++) {
                for (let x = 0; x < WIDTH; x++) {
                    expect(tileAt(maze, x, y)).toBe(tileAt(maze, WIDTH - 1 - x, y));
                    if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) {
                        expect(tileAt(maze, x, y)).toBe(WALL);
                    }
                }
            }
        });
    });

    it("have no dead ends, and every path leads to every other", () => {
        each((maze) => {
            for (const i of paths(maze)) {
                const ways = neighbours(i).filter(({ x, y }) => tileAt(maze, x, y) === PATH);
                expect(ways.length).toBeGreaterThanOrEqual(2);
            }
            const reached = new Set([START.y * WIDTH + START.x]);
            const queue = [...reached];
            while (queue.length > 0) {
                for (const { x, y } of neighbours(queue.shift()!)) {
                    const to = y * WIDTH + x;
                    if (tileAt(maze, x, y) === PATH && !reached.has(to)) {
                        reached.add(to);
                        queue.push(to);
                    }
                }
            }
            expect(reached.size).toBe(paths(maze).length);
        });
    });

    it("have a pen in the middle whose only way out is the door, and ChatMan's start below it", () => {
        each((maze) => {
            for (const { x, y } of PEN_TILES) expect(tileAt(maze, x, y)).toBe(PEN);
            expect(tileAt(maze, OUTSIDE.x, OUTSIDE.y + 1)).toBe(DOOR);
            expect(tileAt(maze, OUTSIDE.x, OUTSIDE.y)).toBe(PATH);
            for (let i = 0; i < maze.tiles.length; i++) {
                if (maze.tiles[i] !== PEN) continue;
                for (const { x, y } of neighbours(i)) {
                    expect([PEN, DOOR, WALL]).toContain(tileAt(maze, x, y));
                }
            }
            expect(tileAt(maze, START.x, START.y)).toBe(PATH);
            expect(tileAt(maze, START.x - 1, START.y)).toBe(PATH);
            expect(tileAt(maze, START.x + 1, START.y)).toBe(PATH);
        });
    });

    it("have a dot on every path but the start, and a power pellet near each corner", () => {
        each((maze) => {
            const start = START.y * WIDTH + START.x;
            for (const i of paths(maze)) expect(maze.food[i] !== 0).toBe(i !== start);
            expect(maze.foodTiles).toEqual(paths(maze).filter((i) => i !== start));
            const pellets = maze.foodTiles.filter((i) => maze.food[i] === PELLET);
            expect(pellets.map((i) => [i % WIDTH, Math.floor(i / WIDTH)])).toEqual([
                [1, 3],
                [WIDTH - 2, 3],
                [1, HEIGHT - 4],
                [WIDTH - 2, HEIGHT - 4],
            ]);
        });
    });

    it("are the same for the same seed and level, and new each level", () => {
        expect(chatMaze(12345, 1)).toEqual(chatMaze(12345, 1));
        expect(chatMaze(12345, 2).tiles).not.toEqual(chatMaze(12345, 1).tiles);
        expect(chatMaze(12346, 1).tiles).not.toEqual(chatMaze(12345, 1).tiles);
    });

    it("build a seed's maze the same in any engine, as the page builds it too", () => {
        const maze = chatMaze(12345, 1);
        expect(fingerprint(maze.tiles)).toBe(1807782075);
        expect(maze.foodTiles).toHaveLength(188);
        expect(fingerprint(chatMaze(12345, 2).tiles)).toBe(2983461438);
    });
});
