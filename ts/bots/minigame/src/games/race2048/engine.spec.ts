import { describe, expect, it } from "vitest";
import { canMove, emptyBoard, maxTile, newBoard, slide, spawn, type Board } from "./engine";

// prettier-ignore
const board = (...rows: number[][]): Board => rows.flat();

describe("slide", () => {
    it("slides tiles to the edge and merges equal neighbours once", () => {
        const start = board([2, 2, 0, 0], [2, 0, 2, 0], [2, 2, 2, 2], [4, 2, 2, 4]);
        const { board: next, gained, moved } = slide(start, "left");
        expect(next).toEqual(board([4, 0, 0, 0], [4, 0, 0, 0], [4, 4, 0, 0], [4, 4, 4, 0]));
        expect(gained).toBe(4 + 4 + 8 + 4);
        expect(moved).toBe(true);
    });

    it("merges from the edge the tiles move towards", () => {
        // Sliding right, the rightmost pair merges first: 2 2 2 → 0 2 4
        expect(slide(board([2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), "right").board)
            .toEqual(board([0, 0, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
        expect(slide(board([2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0]), "down").board)
            .toEqual(board([0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0]));
        expect(slide(board([0, 4, 0, 0], [0, 4, 0, 0], [0, 8, 0, 0], [0, 8, 0, 0]), "up").board)
            .toEqual(board([0, 8, 0, 0], [0, 16, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    });

    it("doesn't merge a tile twice in one move", () => {
        expect(slide(board([4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), "left").board)
            .toEqual(board([8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    });

    it("reports a move that changes nothing", () => {
        const stuck = board([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
        const result = slide(stuck, "left");
        expect(result.moved).toBe(false);
        expect(result.gained).toBe(0);
        expect(result.board).toEqual(stuck);
    });

    it("leaves the board it was given alone", () => {
        const start = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
        const copy = start.slice();
        slide(start, "left");
        expect(start).toEqual(copy);
    });
});

describe("spawn", () => {
    it("puts a 2 or a 4 in an empty cell", () => {
        const start = board([2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 4], [2, 4, 8, 0]);
        expect(spawn(start, () => 0)[15]).toBe(2);
        expect(spawn(start, () => 0.95)[15]).toBe(4);
    });

    it("leaves a full board as it is", () => {
        const full = new Array<number>(16).fill(2);
        expect(spawn(full)).toBe(full);
    });

    it("gives a new board two tiles", () => {
        const tiles = newBoard().filter((v) => v !== 0);
        expect(tiles).toHaveLength(2);
        tiles.forEach((tile) => expect([2, 4]).toContain(tile));
    });
});

describe("canMove", () => {
    it("is true with an empty cell, or a pair of equal neighbours", () => {
        expect(canMove(emptyBoard())).toBe(true);
        expect(canMove(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]))).toBe(true);
        // A vertical pair only, in the first column
        expect(canMove(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [2, 4, 8, 16]))).toBe(true);
    });

    it("is false on a stuck board", () => {
        expect(canMove(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]))).toBe(false);
    });
});

it("maxTile is the largest tile", () => {
    expect(maxTile(board([2, 4, 2, 4], [4, 2, 1024, 2], [2, 4, 2, 4], [4, 2, 4, 2]))).toBe(1024);
    expect(maxTile(emptyBoard())).toBe(0);
});
