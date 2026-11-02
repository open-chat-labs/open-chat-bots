import { describe, expect, it } from "vitest";
import { Board, squareIndex, squareName } from "./board";
import { REVERSI } from "./rules";

const EMPTY = "........";

describe("Reversi's board", () => {
    it("names squares by column, then row from the top", () => {
        expect(squareName(0)).toBe("a1");
        expect(squareName(63)).toBe("h8");
        expect(squareIndex("d3")).toBe(19);
        expect(squareIndex("i1")).toBeUndefined();
        expect(squareIndex("a9")).toBeUndefined();
    });

    it("starts crossed in the middle, with Black to move and four moves to choose from", () => {
        const board = new Board();
        expect(board.count(0)).toBe(2);
        expect(board.count(1)).toBe(2);
        expect(board.turn).toBe(0);
        expect(board.legalMoves()).toEqual(["d3", "c4", "f5", "e6"]);
    });

    it("flips what a move flanks, and passes the turn", () => {
        const board = new Board();
        expect(board.play("d3")).toBeUndefined();
        expect(board.at(squareIndex("d4")!)).toBe(0);
        expect(board.count(0)).toBe(4);
        expect(board.count(1)).toBe(1);
        expect(board.turn).toBe(1);
        expect(board.last).toBe(squareIndex("d3"));
        expect(board.flipped).toEqual([squareIndex("d4")]);
        expect(board.legalMoves()).toEqual(["c3", "e3", "c5"]);
    });

    it("flips in every direction a move flanks at once", () => {
        // Black on e3 flanks d3 against c3, e4 against e5, and d4 on the diagonal against c5
        const board = Board.from(
            [EMPTY, EMPTY, "..BW....", "...WW...", "..B.B...", EMPTY, EMPTY, EMPTY],
            0,
        );
        expect(board.play("e3")).toBeUndefined();
        expect(board.flipped.map(squareName).sort()).toEqual(["d3", "d4", "e4"]);
        expect(board.count(1)).toBe(0);
    });

    it("refuses a taken square, one that flips nothing, and what isn't a square", () => {
        const board = new Board();
        expect(board.play("d4")).toBe("That square's taken");
        expect(board.play("a1")).toBe("A disc has to flip at least one of the other player's");
        expect(board.play("z9")).toBe("That isn't a square");
        expect(board.turn).toBe(0);
    });

    it("passes for a player with no move, and ends when neither has one", () => {
        // After Black takes a1, White's discs on h5 and h7 flank nothing Black has, but Black can
        // still take h8 and h4
        const board = Board.from(
            [".WB.....", EMPTY, EMPTY, EMPTY, ".......W", ".......B", ".......W", EMPTY],
            0,
        );
        expect(board.play("a1")).toBeUndefined();
        expect(board.passed).toBe(1);
        expect(board.turn).toBe(0);
        expect(board.legalMoves().sort()).toEqual(["h4", "h8"]);
        expect(board.play("h8")).toBeUndefined();
        expect(board.passed).toBe(1);
        expect(board.turn).toBe(0);
        // Taking h4 leaves White no discs at all: neither can move
        expect(board.play("h4")).toBeUndefined();
        expect(board.outcome).toEqual({ winner: 0 });
        expect(board.count(0)).toBe(8);
        expect(board.legalMoves()).toEqual([]);
        expect(board.play("g1")).toBe("The game has finished");
        expect(REVERSI.describeBoard(0, board, (seat) => ["Alice", "Bob"][seat])).toBe(
            "Alice won 8 to 0",
        );
    });

    it("is a draw when the board fills with the discs even", () => {
        // 30 Black and 33 White, a1 empty: taking it flips b1, for 32 each
        const board = Board.from(
            [
                ".WBWWWWW",
                "BBBBBBBB",
                "BBBBBBBB",
                "BBBBBBBB",
                "BBBBBWWW",
                "WWWWWWWW",
                "WWWWWWWW",
                "WWWWWWWW",
            ],
            0,
        );
        expect(board.count(0)).toBe(30);
        expect(board.count(1)).toBe(33);
        expect(board.play("a1")).toBeUndefined();
        expect(board.outcome).toEqual({ winner: null });
        expect(REVERSI.describeBoard(null, board, () => "")).toBe("Draw, 32 discs each");
    });

    it("refuses a picture that isn't a board", () => {
        expect(() => Board.from([EMPTY])).toThrow();
        expect(() => Board.from([...Array(7).fill(EMPTY), "......X."])).toThrow();
    });
});
