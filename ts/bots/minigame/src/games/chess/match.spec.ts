import { describe, expect, it } from "vitest";
import { Match } from "./match";
import { TIME_PER_SIDE_MS, type Side } from "./types";

const START = 1_000_000;

// Plays each move a second after the last
function playAll(game: Match, moves: string[], from = START): number {
    let now = from;
    moves.forEach((uci, i) => {
        now += 1000;
        const color: Side = i % 2 === 0 ? "white" : "black";
        const error = game.play(color, uci, now);
        if (error !== undefined) throw new Error(`${uci}: ${error}`);
    });
    return now;
}

describe("a game of chess", () => {
    it("is recorded in algebraic notation and ends in checkmate", () => {
        const game = Match.create(START);
        const now = playAll(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);

        expect(game.ending).toEqual({ kind: "checkmate", winner: "black" });
        const snapshot = game.snapshot(now);
        expect(snapshot.moves).toEqual(["f3", "e5", "g4", "Qh4#"]);
        expect(snapshot.result).toBe("Black won by checkmate");
        expect(snapshot.check).toBe(true);
        expect(snapshot.legal_moves).toEqual([]);
        expect(snapshot.clock.running).toBeNull();
        expect(snapshot.last_move).toEqual({ from: "d8", to: "h4" });
        expect(snapshot.fen).toBe("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
        // The position before each move and after the last, for stepping through the game
        expect(game.fens).toHaveLength(5);
        expect(game.fens[0]).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        expect(game.fens[1]).toBe("rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1");
        expect(game.fens[4]).toBe(snapshot.fen);
        expect(game.play("white", "e1f2", now + 1000)).toBe("The game has finished");
        expect(game.deadline()).toBeUndefined();
    });

    it("castles and promotes from the squares", () => {
        const game = Match.create(START, "4k2r/P7/8/8/8/8/8/R3K2R w KQk - 0 1");
        expect(game.snapshot(START).legal_moves).toContain("e1c1");
        expect(game.snapshot(START).legal_moves).toContain("a7a8q");

        playAll(game, ["e1c1", "e8g8", "a7a8q"]);

        expect(game.snapshot(START).moves).toEqual(["O-O-O", "O-O", "a8=Q"]);
        expect(game.snapshot(START).fen).toBe("Q4rk1/8/8/8/8/8/8/2KR3R b - - 0 2");
    });

    it("needs a legal move, in turn", () => {
        const game = Match.create(START);
        expect(game.play("black", "e7e5", START)).toBe("It's not your turn");
        expect(game.play("white", "e2e5", START)).toBe("e2e5 isn't a legal move");
        expect(game.play("white", "e7e5", START)).toBe("e7e5 isn't a legal move");
        expect(game.play("white", "hello", START)).toBe("'hello' isn't a move");
        expect(game.snapshot(START).moves).toEqual([]);
        expect(game.play("white", "e2e4", START)).toBeUndefined();
        expect(game.snapshot(START).legal_moves).toHaveLength(20);
    });

    it("runs each side's clock while it is to move", () => {
        const game = Match.create(START);
        expect(game.deadline()).toBe(START + TIME_PER_SIDE_MS);
        expect(game.timeLeft("white", START + 4000)).toBe(TIME_PER_SIDE_MS - 4000);
        expect(game.timeLeft("black", START + 4000)).toBe(TIME_PER_SIDE_MS);

        game.play("white", "e2e4", START + 5000);

        const snapshot = game.snapshot(START + 7000);
        expect(snapshot.clock).toEqual({
            at: START + 7000,
            white_ms: TIME_PER_SIDE_MS - 5000,
            black_ms: TIME_PER_SIDE_MS - 2000,
            running: "black",
        });
        expect(game.deadline()).toBe(START + 5000 + TIME_PER_SIDE_MS);
    });

    it("flags the side to move when its time runs out", () => {
        const game = Match.create(START);
        game.play("white", "e2e4", START + 1000);
        const deadline = game.deadline()!;

        expect(game.flag(deadline - 1)).toBe(false);
        expect(game.isOver).toBe(false);
        expect(game.play("black", "e7e5", deadline)).toBe("Your time ran out");
        expect(game.flag(deadline + 500)).toBe(true);

        expect(game.ending).toEqual({ kind: "timeout", winner: "white" });
        const snapshot = game.snapshot(deadline + 60_000);
        expect(snapshot.result).toBe("White won on time");
        expect(snapshot.clock.black_ms).toBe(0);
        // White's clock stopped when it moved
        expect(snapshot.clock.white_ms).toBe(TIME_PER_SIDE_MS - 1000);
        expect(game.flag(deadline + 1000)).toBe(false);
    });

    it("draws a flag against a bare king", () => {
        const game = Match.create(START, "k6r/8/8/8/8/8/8/K7 b - - 0 1");
        expect(game.flag(START + TIME_PER_SIDE_MS)).toBe(true);
        expect(game.ending).toEqual({ kind: "timeout_draw" });
        expect(game.snapshot(START).result).toBe("Draw: time ran out against insufficient material");

        // A king and a bishop can't mate a bare king either, but a king and a rook can
        const bishop = Match.create(START, "k6r/8/8/8/8/8/8/KB6 b - - 0 1");
        bishop.flag(START + TIME_PER_SIDE_MS);
        expect(bishop.ending).toEqual({ kind: "timeout_draw" });
        const rook = Match.create(START, "k7/8/8/8/8/8/8/KR6 b - - 0 1");
        rook.flag(START + TIME_PER_SIDE_MS);
        expect(rook.ending).toEqual({ kind: "timeout", winner: "white" });
    });

    it("is drawn by repetition, stalemate, material and the fifty-move rule", () => {
        const game = Match.create(START);
        playAll(game, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]);
        expect(game.ending).toEqual({ kind: "repetition" });
        expect(game.snapshot(START).result).toBe("Draw by threefold repetition");

        const on = Match.create(START, "k7/8/1Q6/8/8/8/8/K7 w - - 0 1");
        playAll(on, ["b6b7"]);
        expect(on.ending).toBeUndefined();
        const stalemate = Match.create(START, "k7/8/1Q6/8/8/8/8/K7 w - - 0 1");
        playAll(stalemate, ["b6c7"]);
        expect(stalemate.ending).toEqual({ kind: "stalemate" });

        // The knight takes the rook, leaving no one able to mate
        const material = Match.create(START, "k7/8/1n6/3R4/8/8/8/K7 w - - 0 1");
        playAll(material, ["a1a2", "b6d5"]);
        expect(material.ending).toEqual({ kind: "insufficient_material" });

        const fifty = Match.create(START, "k7/8/8/8/8/8/8/K6R w - - 99 80");
        playAll(fifty, ["h1h2"]);
        expect(fifty.ending).toEqual({ kind: "fifty_moves" });
        expect(fifty.snapshot(START).result).toBe("Draw by the fifty-move rule");
    });

    it("lets a side resign, whoever is to move", () => {
        const game = Match.create(START);
        expect(game.resign("black", START + 1000)).toBeUndefined();
        expect(game.ending).toEqual({ kind: "resignation", winner: "white" });
        expect(game.snapshot(START).result).toBe("Black resigned");
        expect(game.resign("white", START + 2000)).toBe("The game has finished");
        // The clock stopped when the game ended
        expect(game.snapshot(START + 9000).clock.white_ms).toBe(TIME_PER_SIDE_MS - 1000);
    });

    it("keeps a draw offer until the other side moves or accepts", () => {
        const game = Match.create(START);
        expect(game.offerDraw("white", START)).toBeUndefined();
        expect(game.snapshot(START).draw_offer).toBe("white");
        // Offering again changes nothing
        expect(game.offerDraw("white", START)).toBeUndefined();
        expect(game.snapshot(START).draw_offer).toBe("white");
        // Moving on with the game declines it
        game.play("white", "e2e4", START + 1000);
        expect(game.snapshot(START).draw_offer).toBe("white");
        game.play("black", "e7e5", START + 2000);
        expect(game.snapshot(START).draw_offer).toBeNull();

        expect(game.offerDraw("black", START + 3000)).toBeUndefined();
        expect(game.snapshot(START).draw_offer).toBe("black");
        expect(game.offerDraw("white", START + 4000)).toBeUndefined();
        expect(game.ending).toEqual({ kind: "agreement" });
        const snapshot = game.snapshot(START + 4000);
        expect(snapshot.draw_offer).toBeNull();
        expect(snapshot.result).toBe("Draw by agreement");
    });

    it("is rebuilt from its data, with every position the rules need", () => {
        const game = Match.create(START);
        playAll(game, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6"]);
        game.offerDraw("white", START + 7000);

        const copy = new Match(JSON.parse(JSON.stringify(game.data)));

        expect(copy.snapshot(START + 8000)).toEqual(game.snapshot(START + 8000));
        expect(copy.deadline()).toBe(game.deadline());
        // The repetitions before the restart still count
        playAll(copy, ["f3g1", "f6g8"], START + 6000);
        expect(copy.ending).toEqual({ kind: "repetition" });
    });
});
