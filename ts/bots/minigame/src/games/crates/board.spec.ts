import { describe, expect, it } from "vitest";
import { Board, isPath, play, readLevel, SIDE } from "./board";
import { EASY_LEVELS, HARD_LEVELS, MEDIUM_LEVELS } from "./levels";
import { LEVEL, SOLUTION } from "./sample";

const at = (row: number, column: number) => row * SIDE + column;

describe("a Crate Race board", () => {
    it("reads a level, and refuses what isn't one", () => {
        const level = readLevel(LEVEL)!;
        expect(level.player).toBe(at(1, 1));
        expect(level.crates).toEqual([at(1, 3), at(3, 2)]);
        expect(level.goals.filter(Boolean)).toHaveLength(2);
        expect(readLevel(LEVEL.slice(1))).toBeUndefined();
        expect(readLevel(LEVEL.replace("@", "-"))).toBeUndefined();
        expect(readLevel(LEVEL.replace(".", "-"))).toBeUndefined();
        expect(readLevel(LEVEL.replace("-", "x"))).toBeUndefined();
    });

    it("steps onto floor, and not into a wall or off the level", () => {
        const board = new Board(readLevel(LEVEL)!);
        expect(board.move("u")).toBe(false);
        expect(board.move("l")).toBe(false);
        expect(board.move("d")).toBe(true);
        expect(board.player).toBe(at(2, 1));
        // The bottom-right corner of the inside, with nothing beyond it
        const corner = new Board(readLevel("-".repeat(SIDE * SIDE - 3) + "$.@")!);
        expect(corner.move("r")).toBe(false);
        expect(corner.move("d")).toBe(false);
    });

    it("pushes a crate onto clear floor, but not into a wall or another crate", () => {
        const board = new Board(readLevel(LEVEL)!);
        board.move("r");
        expect(board.move("r")).toBe(true);
        expect(board.crates).toEqual([at(1, 4), at(3, 2)]);
        expect(board.pushes).toBe(1);
        expect(board.move("r")).toBe(true);
        expect(board.placed).toBe(1);
        board.move("r");
        // The crate's against the wall now
        expect(board.move("r")).toBe(false);
        expect(board.crates[0]).toBe(at(1, 6));

        const two = new Board(readLevel("@$$.." + "-".repeat(SIDE * SIDE - 5))!);
        expect(two.move("r")).toBe(false);
    });

    it("plays a path as far as its moves can be made, and knows when it's solved", () => {
        const solved = play(readLevel(LEVEL)!, SOLUTION);
        expect(solved.played).toBe(SOLUTION.length);
        expect(solved.board.solved).toBe(true);
        expect(solved.board.pushes).toBe(5);
        const stuck = play(readLevel(LEVEL)!, "uurr");
        expect(stuck.played).toBe(0);
        expect(stuck.board.player).toBe(at(1, 1));
        expect(isPath("udlr", 4)).toBe(true);
        expect(isPath("udlrx", 10)).toBe(false);
        expect(isPath("uuuuu", 4)).toBe(false);
    });

    it("walks the player round to a cell without pushing anything", () => {
        const board = new Board(readLevel(LEVEL)!);
        // Round under the crate, rather than through it
        const walk = board.walkTo(at(1, 4))!;
        expect(walk).toHaveLength(5);
        for (const move of walk) board.move(move);
        expect(board.player).toBe(at(1, 4));
        expect(board.pushes).toBe(0);
        expect(board.walkTo(at(1, 4))).toEqual([]);
        // Not onto a wall or a crate
        expect(board.walkTo(at(0, 0))).toBeUndefined();
        expect(board.walkTo(at(3, 2))).toBeUndefined();
    });
});

describe("the levels", () => {
    it("are 500 of each difficulty, each a level with four crates and its fewest pushes", () => {
        for (const levels of [EASY_LEVELS, MEDIUM_LEVELS, HARD_LEVELS]) {
            expect(levels).toHaveLength(500);
            for (const line of levels) {
                const [code, par] = line.split(" ");
                expect(readLevel(code)?.crates).toHaveLength(4);
                expect(Number(par)).toBeGreaterThan(0);
            }
        }
        expect(new Set([...EASY_LEVELS, ...MEDIUM_LEVELS, ...HARD_LEVELS]).size).toBe(1500);
    });
});
