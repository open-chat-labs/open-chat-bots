import { describe, expect, it } from "vitest";
import { fieldOf, lay, mineCells, neighbours, solves } from "./field";
import { MINES } from "./settings";

describe("a minefield", () => {
    it("lays the same field from the same seed", () => {
        expect(mineCells(lay(12, 22, 1234))).toEqual(mineCells(lay(12, 22, 1234)));
        expect(mineCells(lay(12, 22, 1234))).not.toEqual(mineCells(lay(12, 22, 1235)));
    });

    it("lays as many mines as it's asked, none touching the start, away from the edges", () => {
        for (const [size, mines] of Object.entries(MINES).map(([s, m]) => [Number(s), m])) {
            for (let seed = 1; seed <= 20; seed++) {
                const field = lay(size, mines, seed * 7919);
                expect(mineCells(field)).toHaveLength(mines);
                expect(field.count[field.start]).toBe(0);
                expect(field.mine[field.start]).toBe(0);
                for (const n of neighbours(size, field.start)) expect(field.mine[n]).toBe(0);
                const x = field.start % size;
                const y = Math.floor(field.start / size);
                expect(Math.min(x, y, size - 1 - x, size - 1 - y)).toBeGreaterThan(0);
            }
        }
    });

    it("only lays fields that can be cleared without a guess", () => {
        for (const [size, mines] of Object.entries(MINES).map(([s, m]) => [Number(s), m])) {
            for (let seed = 1; seed <= 50; seed++) {
                expect(solves(lay(size, mines, seed * 104729))).toBe(true);
            }
        }
    });

    it("counts each cell's mines, across and diagonally", () => {
        // A mine in the middle of a 3 by 3: every other cell touches it
        const field = fieldOf(3, [4], 0);
        expect(Array.from(field.count)).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 1]);
        expect(neighbours(3, 0).sort()).toEqual([1, 3, 4]);
        expect(neighbours(3, 4)).toHaveLength(8);
    });

    it("can't solve a field which takes a guess", () => {
        // Opening from the middle of a 5 by 5 leaves the top row hidden, over the numbers 1 1 1 1 1:
        // mines at 0 and 3 read the same as mines at 1 and 4
        expect(Array.from(fieldOf(5, [0, 3], 12).count.slice(5, 10))).toEqual([1, 1, 1, 1, 1]);
        expect(solves(fieldOf(5, [0, 3], 12))).toBe(false);
        expect(solves(fieldOf(5, [1, 4], 12))).toBe(false);
        // While mines at 0 and 4 read 1 1 0 1 1, which settles them
        expect(solves(fieldOf(5, [0, 4], 12))).toBe(true);
    });

    it("settles cells by two numbers together, which no number does on its own", () => {
        // The top row hidden over 1 2 1 2 1: no number has as many hidden cells as mines, or none
        // left, but the 2 at the second cell needs one more than the 1 before it, which it alone
        // touches the third cell for, so that's a mine, and so on along the row
        const field = fieldOf(5, [0, 2, 4], 12);
        expect(Array.from(field.count.slice(5, 10))).toEqual([1, 2, 1, 2, 1]);
        expect(solves(field)).toBe(true);
    });
});
