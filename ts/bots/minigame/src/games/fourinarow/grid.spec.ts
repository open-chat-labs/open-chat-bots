import { describe, expect, it } from "vitest";
import { cellIndex, COLUMNS, Grid, ROWS } from "./grid";

/** A grid after the columns are played in turn, seat 0 first */
function played(...columns: number[]): Grid {
    const grid = new Grid();
    for (const column of columns) {
        const error = grid.play(column);
        if (error !== undefined) throw new Error(error);
    }
    return grid;
}

describe("Four in a Row's grid", () => {
    it("drops each disc to the lowest free cell, taking turns", () => {
        const grid = played(3, 3, 4);
        expect(grid.at(3, 0)).toBe(0);
        expect(grid.at(3, 1)).toBe(1);
        expect(grid.at(4, 0)).toBe(0);
        expect(grid.at(4, 1)).toBeNull();
        expect(grid.height(3)).toBe(2);
        expect(grid.turn).toBe(1);
        expect(grid.outcome).toBeUndefined();
    });

    it("wins with four across, and says which cells", () => {
        // Seat 0 along the bottom, seat 1 on top of it
        const grid = played(0, 0, 1, 1, 2, 2, 3);
        expect(grid.outcome).toEqual({ winner: 0 });
        expect(grid.line).toEqual([0, 1, 2, 3].map((c) => cellIndex(c, 0)));
        expect(grid.legalMoves()).toEqual([]);
        expect(grid.play(5)).toBe("The game has finished");
        // The last to move stays the one to move
        expect(grid.turn).toBe(0);
    });

    it("wins with four up a column", () => {
        const grid = played(6, 0, 6, 0, 6, 0, 1, 0);
        expect(grid.outcome).toEqual({ winner: 1 });
        expect(grid.line).toEqual([0, 1, 2, 3].map((r) => cellIndex(0, r)));
    });

    it("wins on either diagonal", () => {
        // Seat 0 climbs from (0,0) to (3,3)
        const rising = played(0, 1, 1, 2, 2, 3, 2, 3, 3, 5, 3);
        expect(rising.outcome).toEqual({ winner: 0 });
        expect(rising.line).toEqual([0, 1, 2, 3].map((i) => cellIndex(i, i)));
        // Seat 0 falls from (0,3) to (3,0)
        const falling = played(3, 2, 2, 1, 1, 0, 1, 0, 0, 5, 0);
        expect(falling.outcome).toEqual({ winner: 0 });
        expect(falling.line).toEqual([0, 1, 2, 3].map((i) => cellIndex(i, 3 - i)));
    });

    it("counts a line of five as one line, all of it", () => {
        // Seat 0 fills the gap in the middle of 0, 1, _, 3, 4
        const grid = played(0, 0, 1, 1, 3, 3, 4, 4, 2);
        expect(grid.outcome).toEqual({ winner: 0 });
        expect(grid.line).toEqual([0, 1, 2, 3, 4].map((c) => cellIndex(c, 0)));
    });

    it("refuses a full column, and what isn't a column", () => {
        const grid = played(0, 0, 0, 0, 0, 0);
        expect(grid.legalMoves()).toEqual([1, 2, 3, 4, 5, 6]);
        expect(grid.play(0)).toBe("That column's full");
        expect(grid.play(7)).toBe("That isn't a column");
        expect(grid.play(-1)).toBe("That isn't a column");
        expect(grid.play(1.5)).toBe("That isn't a column");
        expect(grid.turn).toBe(0);
    });

    it("is a draw when the grid fills with no line", () => {
        // Columns filled in pairs, a pattern with no four in any direction: 0,1 then 2,3 then 4,5,
        // each pair swapped every two rows, and the last column alone
        const order: number[] = [];
        for (const [a, b] of [
            [0, 1],
            [2, 3],
            [4, 5],
        ]) {
            for (let r = 0; r < ROWS; r++) order.push(r % 4 < 2 ? a : b, r % 4 < 2 ? b : a);
        }
        const grid = new Grid();
        for (const column of order) {
            expect(grid.play(column)).toBeUndefined();
        }
        for (let r = 0; r < ROWS; r++) expect(grid.play(6)).toBeUndefined();
        expect(grid.outcome).toEqual({ winner: null });
        expect(grid.line).toBeUndefined();
        expect([...Array(COLUMNS).keys()].every((c) => grid.height(c) === ROWS)).toBe(true);
    });
});
