import { describe, expect, it } from "vitest";
import {
    canMove,
    carve,
    DIRECTIONS,
    isWayOut,
    seeded,
    stepsOut,
    wayOut,
    type Direction,
    type Maze,
} from "./maze";

/** A short fingerprint of a maze's walls */
function fingerprint(maze: Maze): number {
    let hash = 2166136261;
    for (const cell of maze.open) hash = Math.imul(hash ^ cell, 16777619) >>> 0;
    return hash;
}

describe("a maze", () => {
    it("is carved the same from the same seed, and differently from another", () => {
        expect(carve(15, 42).open).toEqual(carve(15, 42).open);
        expect(carve(15, 42).open).not.toEqual(carve(15, 43).open);
    });

    it("is carved exactly as it always has been, as a finished card carves its maze again", () => {
        // Pinned when the maze race was written: if these change, every finished race's card
        // would show a different maze from the one raced in
        const first = seeded(12345);
        expect([first(), first(), first()]).toEqual([4207900869, 1317490944, 2079646450]);
        expect(fingerprint(carve(15, 12345))).toBe(2062523883);
        expect(stepsOut(carve(15, 12345), 0, 0)).toBe(92);
    });

    it("has one way between any two cells: every cell reached, and no loops", () => {
        for (const size of [11, 15, 21, 25]) {
            const maze = carve(size, size * 7);
            let openings = 0;
            for (const cell of maze.open) {
                for (let bit = 1; bit <= 8; bit <<= 1) if (cell & bit) openings++;
            }
            // Each passage is open from both its cells: a tree has one fewer passage than cells
            expect(openings / 2).toBe(size * size - 1);
            expect(maze.distance.every((d) => d !== 0xffff)).toBe(true);
        }
    });

    it("is walled all round, and each passage is open from both sides", () => {
        const maze = carve(11, 5);
        for (let y = 0; y < 11; y++) {
            for (let x = 0; x < 11; x++) {
                for (const [d, { dx, dy }] of Object.entries(DIRECTIONS)) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const out = nx < 0 || ny < 0 || nx >= 11 || ny >= 11;
                    if (out) {
                        expect(canMove(maze, x, y, d as Direction)).toBe(false);
                        continue;
                    }
                    const back = { up: "down", down: "up", left: "right", right: "left" }[d]!;
                    expect(canMove(maze, x, y, d as Direction)).toBe(
                        canMove(maze, nx, ny, back as Direction),
                    );
                }
            }
        }
    });

    it("counts the steps from every cell to the way out", () => {
        const maze = carve(15, 99);
        expect(stepsOut(maze, 14, 14)).toBe(0);
        expect(isWayOut(maze, 14, 14)).toBe(true);
        const path = wayOut(maze);
        expect(path).toHaveLength(stepsOut(maze, 0, 0));
        // Followed from the start, it gets out
        let [x, y] = [0, 0];
        for (const d of path) {
            expect(canMove(maze, x, y, d)).toBe(true);
            x += DIRECTIONS[d].dx;
            y += DIRECTIONS[d].dy;
        }
        expect(isWayOut(maze, x, y)).toBe(true);
        expect(wayOut(maze, 14, 14)).toEqual([]);
    });
});
