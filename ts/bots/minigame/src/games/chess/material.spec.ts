import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { capturedBetween, materialLead } from "./material";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
/** chess.js plays a few thousand random moves in a second or two, more on a busy machine */
const RANDOM_GAMES_MS = 20_000;

/**
 * A game played at random from a seed, keen on captures and promotions, which a game written out
 * by hand would have few of: its positions, and what chess.js says each side took
 */
function randomGame(seed: number) {
    const chess = new Chess();
    const fens = [chess.fen()];
    const captured = { white: "", black: "" };
    let state = seed;
    const next = () => (state = (state * 48_271) % 2_147_483_647) / 2_147_483_647;
    while (!chess.isGameOver() && fens.length <= 300) {
        const legal = chess.moves({ verbose: true });
        const keen = legal.filter((m) => m.captured !== undefined || m.promotion !== undefined);
        const pool = keen.length > 0 && next() < 0.6 ? keen : legal;
        const move = chess.move(pool[Math.floor(next() * pool.length)]);
        if (move.captured !== undefined) {
            captured[move.color === "w" ? "white" : "black"] += move.captured;
        }
        fens.push(chess.fen());
    }
    return { fens, captured };
}

describe("what's been taken", () => {
    it("is what the other side has one fewer of after each move", () => {
        expect(
            capturedBetween([
                START,
                // 1. e4 d5 2. exd5 Qxd5
                "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
                "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR",
                "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR",
                "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR",
            ]),
        ).toEqual({ white: "p", black: "p" });
    });

    it("counts a promotion as no capture, and a capture that promotes as the piece taken", () => {
        expect(
            capturedBetween([
                "r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1",
                // bxa8=Q
                "Q3k3/8/8/8/8/8/8/4K3 b - - 0 1",
            ]),
        ).toEqual({ white: "r", black: "" });
        expect(
            capturedBetween(["4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", "1Q2k3/8/8/8/8/8/8/4K3 b - - 0 1"]),
        ).toEqual({ white: "", black: "" });
    });

    it(
        "agrees with chess.js, move for move, in games full of captures",
        { timeout: RANDOM_GAMES_MS },
        () => {
            for (let seed = 1; seed <= 15; seed++) {
                const game = randomGame(seed);
                expect(capturedBetween(game.fens), `seed ${seed}`).toEqual(game.captured);
            }
        },
    );
});

describe("the lead", () => {
    it("is what White has on the board over Black, in pawns", () => {
        expect(materialLead(START)).toBe(0);
        // Black's queen gone, and a white pawn
        expect(materialLead("rnb1kbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1")).toBe(8);
        // A pawn made a queen counts as a queen
        expect(materialLead("Q3k3/8/8/8/8/8/8/4K3")).toBe(9);
        expect(materialLead("4k3/8/8/8/8/8/8/r3K3")).toBe(-5);
    });
});
