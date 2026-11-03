import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { toPgn } from "./pgn";

/** A game's moves, played at random from a seed, with castling, promotions and the rest */
function randomMoves(seed: number): string[] {
    const chess = new Chess();
    let state = seed;
    const next = () => (state = (state * 48_271) % 2_147_483_647) / 2_147_483_647;
    for (let ply = 0; ply < 300 && !chess.isGameOver(); ply++) {
        const legal = chess.moves();
        chess.move(legal[Math.floor(next() * legal.length)]);
    }
    return chess.history();
}

describe("PGN", () => {
    it("gives the Seven Tag Roster, the time control, the moves, and how the game ended", () => {
        const pgn = toPgn({
            white: "Alice",
            black: "Bob",
            moves: ["f3", "e5", "g4", "Qh4#"],
            winner: "black",
            result: "Black won by checkmate",
            startedAt: Date.UTC(2026, 10, 3, 23, 59),
            timeControl: { seconds: 600, increment: 2 },
        });
        expect(pgn).toBe(
            [
                '[Event "Casual game"]',
                '[Site "OpenChat"]',
                '[Date "2026.11.03"]',
                '[Round "-"]',
                '[White "Alice"]',
                '[Black "Bob"]',
                '[Result "0-1"]',
                '[TimeControl "600+2"]',
                "",
                "1. f3 e5 2. g4 Qh4# {Black won by checkmate} 0-1",
                "",
            ].join("\n"),
        );
    });

    it("scores a draw, or leaves the result open if it isn't known, and the date if that isn't", () => {
        const draw = toPgn({ white: "A", black: "B", moves: ["e4"], winner: null });
        expect(draw).toContain('[Result "1/2-1/2"]');
        expect(draw).toMatch(/1\. e4 1\/2-1\/2\n$/);
        const unknown = toPgn({ white: "A", black: "B", moves: [], winner: undefined });
        expect(unknown).toContain('[Date "????.??.??"]');
        expect(unknown).toContain('[Result "*"]');
        expect(unknown).not.toContain("TimeControl");
        expect(unknown).toMatch(/\n\n\*\n$/);
    });

    it("keeps a name to one line without quotes, and a brace out of the comment", () => {
        const pgn = toPgn({
            white: 'Al "the \\ Knight"',
            black: "Bob\nSmith",
            moves: ["e4", "e5"],
            winner: "white",
            result: "White {won}",
        });
        expect(pgn).toContain(`[White "Al 'the / Knight'"]`);
        expect(pgn).toContain('[Black "Bob Smith"]');
        expect(pgn).toContain("{White won} 1-0");
        const chess = new Chess();
        chess.loadPgn(pgn);
        expect(chess.getHeaders()).toMatchObject({
            White: "Al 'the / Knight'",
            Black: "Bob Smith",
        });
        expect(chess.getComments()).toEqual([{ fen: chess.fen(), comment: "White won" }]);
    });

    it("is read back by chess.js, move for move, in lines within 80 characters", () => {
        for (let seed = 1; seed <= 20; seed++) {
            const moves = randomMoves(seed);
            const pgn = toPgn({
                white: "Alice",
                black: "Bob",
                moves,
                winner: "white",
                result: "White won on time",
                startedAt: 0,
                timeControl: { seconds: 300, increment: 0 },
            });
            for (const line of pgn.split("\n")) expect(line.length).toBeLessThan(80);
            const chess = new Chess();
            chess.loadPgn(pgn);
            expect(chess.history()).toEqual(moves);
            expect(chess.getHeaders()).toMatchObject({
                White: "Alice",
                Black: "Bob",
                Result: "1-0",
                Date: "1970.01.01",
                TimeControl: "300+0",
            });
        }
    });
});
