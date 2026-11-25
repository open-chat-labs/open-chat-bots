// Stockfish itself, run as the bot runs it: a legal move at every level, the mate when there's
// one at the top level, and a fresh process after it's stopped
import { Chess } from "chess.js";
import { afterAll, describe, expect, it } from "vitest";
import { LEVELS, StockfishEngine } from "./engine";

const engine = new StockfishEngine();
afterAll(() => engine.stop());

/** White to mate with Qxf7 */
const SCHOLARS = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

function isLegal(fen: string, uci: string): boolean {
    try {
        new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        return true;
    } catch {
        return false;
    }
}

describe("Stockfish", () => {
    it("finds a legal move at every level", async () => {
        const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        for (const level of Object.keys(LEVELS).map(Number)) {
            expect(isLegal(fen, await engine.bestMove(fen, level)), `level ${level}`).toBe(true);
        }
    }, 30_000);

    it("mates at the top level, and promotes as UCI says", async () => {
        expect(await engine.bestMove(SCHOLARS, 8)).toBe("h5f7");
        // c8=Q and c8=R both mate
        expect(await engine.bestMove("k7/2P5/1K6/8/8/8/8/8 w - - 0 1", 8)).toMatch(/^c7c8[qr]$/);
    }, 30_000);

    it("searches one position after another, and starts again once stopped", async () => {
        const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const moves = await Promise.all([1, 2, 3].map((level) => engine.bestMove(fen, level)));
        for (const move of moves) expect(isLegal(fen, move)).toBe(true);
        engine.stop();
        expect(await engine.bestMove(SCHOLARS, 8)).toBe("h5f7");
        await expect(engine.bestMove(SCHOLARS, 9)).rejects.toThrow("There's no level 9");
    }, 30_000);
});
