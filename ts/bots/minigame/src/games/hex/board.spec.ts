import { describe, expect, it } from "vitest";
import { seeded } from "../maze/maze";
import { Duel } from "../duel/duel";
import { replay } from "../duel/types";
import { cellIndex, cellName, HexBoard, neighbours, SWAP } from "./board";
import { HEX } from "./rules";

describe("a Hex board", () => {
    it("names its cells by column from a and row from 1", () => {
        expect(cellName(11, 0)).toBe("a1");
        expect(cellName(11, 10)).toBe("k1");
        expect(cellName(11, 120)).toBe("k11");
        expect(cellIndex(11, "f6")).toBe(5 * 11 + 5);
        expect(cellIndex(9, "j1")).toBeUndefined();
        expect(cellIndex(9, "a10")).toBeUndefined();
        expect(cellIndex(9, "a0")).toBeUndefined();
    });

    it("gives each cell its six neighbours, fewer at the edges", () => {
        // b2 on a 3 by 3: a2 and c2 beside it, b1 and c1 above, a3 and b3 below
        expect(
            neighbours(3, 4)
                .map((i) => cellName(3, i))
                .sort(),
        ).toEqual(["a2", "a3", "b1", "b3", "c1", "c2"].sort());
        expect(
            neighbours(3, 0)
                .map((i) => cellName(3, i))
                .sort(),
        ).toEqual(["a2", "b1"]);
        // The obtuse corners have three, the acute ones two
        expect(neighbours(3, 2)).toHaveLength(3);
        expect(neighbours(3, 8)).toHaveLength(2);
    });

    it("takes turns, refusing a taken cell or one off the board", () => {
        const board = new HexBoard(9);
        expect(board.turn).toBe(0);
        expect(board.play("e5")).toBeUndefined();
        expect(board.at(cellIndex(9, "e5")!)).toBe(0);
        expect(board.turn).toBe(1);
        expect(board.play("e5")).toBe("That cell's taken");
        expect(board.play("j1")).toBe("That isn't a cell");
        expect(board.last).toBe(cellIndex(9, "e5"));
    });

    it("lets the second player swap instead of their first stone, and only then", () => {
        const board = new HexBoard(9);
        expect(board.legalMoves()).not.toContain(SWAP);
        board.play("c2");
        expect(board.legalMoves()).toContain(SWAP);
        expect(board.play(SWAP)).toBeUndefined();
        // The stone is the second player's, reflected: column c, row 2 becomes column b, row 3
        expect(board.at(cellIndex(9, "c2")!)).toBeNull();
        expect(board.at(cellIndex(9, "b3")!)).toBe(1);
        expect(board.swapped).toBe(true);
        expect(board.turn).toBe(0);
        expect(board.legalMoves()).not.toContain(SWAP);
        expect(board.play(SWAP)).toBe("You can only swap instead of your first stone");

        const late = new HexBoard(9);
        late.play("a1");
        late.play("b1");
        expect(late.play(SWAP)).toBe("You can only swap instead of your first stone");
    });

    it("gives the game to the first to join their edges: top and bottom, or left and right", () => {
        // The first player's column down the middle, but for its last cell
        const top = HexBoard.from(["..X..", "..XO.", "..XO.", "..XO.", "...OO"]);
        expect(top.turn).toBe(0);
        expect(top.outcome).toBeUndefined();
        top.play("c5");
        expect(top.outcome).toEqual({ winner: 0 });
        expect(top.chain.map((i) => cellName(5, i)).sort()).toEqual(["c1", "c2", "c3", "c4", "c5"]);
        expect(top.legalMoves()).toEqual([]);
        expect(top.play("a1")).toBe("The game has finished");

        // The second player's row straight across, but for its last cell
        const left = HexBoard.from(["XX...", "OOOO.", "X.X..", "..X..", "....."]);
        expect(left.turn).toBe(1);
        left.play("e2");
        expect(left.outcome).toEqual({ winner: 1 });

        // The first player joining the bottom and the left, one of their edges and one of the
        // other player's, isn't a win
        const not = HexBoard.from([".....", "OOOO.", "XX...", "X....", "....."]);
        not.play("a5");
        expect(not.outcome).toBeUndefined();
    });

    it("always ends with a winner before the board's full, as Hex can't be drawn", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const next = seeded(seed);
            const board = new HexBoard(5);
            while (board.outcome === undefined) {
                const moves = board.legalMoves().filter((m) => m !== SWAP);
                expect(moves.length).toBeGreaterThan(0);
                board.play(moves[next() % moves.length]);
            }
            expect(board.chain.length).toBeGreaterThanOrEqual(5);
        }
    });

    it("is as big as the settings say, from when the game starts", () => {
        expect(replay(HEX, [], {}).size).toBe(9);
        expect(replay(HEX, ["a1", SWAP], { size: 13 }).size).toBe(13);
        const duel = Duel.create(HEX, { host: { id: "alice", name: "Alice" }, random: () => 0.9 });
        duel.join("alice", "Alice");
        duel.join("bob", "Bob");
        expect(duel.configure("alice", { size: 11 })).toEqual({ ok: true });
        duel.start();
        expect(duel.position.size).toBe(11);
        const first = duel.playerAt(0)!;
        expect(duel.play(first, "k11")).toMatchObject({ ok: true });
        // Read back from the store, on the same board
        const back = new Duel(HEX, JSON.parse(JSON.stringify(duel.toJson())));
        expect(back.position.size).toBe(11);
        expect(back.position.at(cellIndex(11, "k11")!)).toBe(0);
    });

    it("says how the board ended the game", () => {
        const name = (seat: 0 | 1) => (seat === 0 ? "Alice" : "Bob");
        const board = new HexBoard(9);
        expect(HEX.describeBoard(0, board, name)).toBe("Alice joined the top and bottom");
        expect(HEX.describeBoard(1, board, name)).toBe("Bob joined the left and right");
        expect(HEX.parseMove("e5")).toBe("e5");
        expect(HEX.parseMove(SWAP)).toBe(SWAP);
        expect(HEX.parseMove("e")).toBeUndefined();
        expect(HEX.parseMove(5)).toBeUndefined();
    });
});
