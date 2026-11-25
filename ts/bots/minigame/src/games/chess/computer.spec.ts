// Chess against the computer: the host alone, the computer's seat, whose move it is, and the
// computer's moves as the bot's engine gives them
import { describe, expect, it } from "vitest";
import { ChessGame } from "./chess";
import { WHITE_IS_HOST, WHITE_IS_OPPONENT } from "./settings";
import { COMPUTER } from "./types";

const START = 1_000_000;

function against(level: number, white = WHITE_IS_HOST) {
    let now = START;
    const game = ChessGame.create({
        now: () => now,
        settings: { opponent: level, white },
        host: { id: "alice", name: "Alice" },
    });
    expect(game.join("alice", "Alice")).toBeUndefined();
    return { game, tick: (ms: number) => (now += ms) };
}

describe("chess against the computer", () => {
    it("is the host's alone: no one else can join, and the host starts it", () => {
        const { game } = against(3);
        expect(game.join("bob", "Bob")).toBe("The host is playing the computer");
        expect(game.cannotStart()).toBeUndefined();
        expect(game.computerLevel).toBe(3);
        // The service is told only of the people playing
        expect(game.start()).toEqual(["alice"]);
        expect(game.white).toBe("alice");
        expect(game.black).toBe(COMPUTER);
        expect(game.shared()).toMatchObject({
            players: ["alice", COMPUTER],
            names: { alice: "Alice", [COMPUTER]: "Computer (level 3)" },
            settings: { opponent: 3 },
        });
        expect(game.isPlayer("alice")).toBe(true);
    });

    it("can't start without the host", () => {
        const game = ChessGame.create({
            settings: { opponent: 2 },
            host: { id: "alice", name: "Alice" },
        });
        expect(game.cannotStart()).toBe("The host plays the computer");
    });

    it("leaves out anyone who joined before the host chose the computer", () => {
        const game = ChessGame.create({ host: { id: "alice", name: "Alice" } });
        game.join("alice", "Alice");
        game.join("bob", "Bob");
        expect(game.configure("alice", { opponent: 5 })).toEqual({ ok: true });
        expect(game.start()).toEqual(["alice"]);
        expect(game.isSeated("bob")).toBe(false);
        expect(game.computerLevel).toBe(5);
    });

    it("waits for the computer's move, which is played if the position's still the one it was found for", () => {
        const { game, tick } = against(4);
        game.start();
        expect(game.waitingFor()).toEqual(["alice"]);
        expect(game.computerTurn()).toBeUndefined();
        expect(game.move("alice", "e2e4").ok).toBe(true);
        // The computer's move: no one to wait for, as the service sees it
        expect(game.waitingFor()).toEqual([]);
        const turn = game.computerTurn();
        // Its first move, which has a minute
        expect(turn).toEqual({
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            level: 4,
            ply: 1,
            timeLeftMs: 60_000,
        });
        expect(game.playComputer(0, "e7e5")).toBe(false);
        expect(game.playComputer(1, "e2e4")).toBe(false);
        tick(800);
        expect(game.playComputer(1, "e7e5")).toBe(true);
        expect(game.match?.moves).toEqual(["e4", "e5"]);
        expect(game.waitingFor()).toEqual(["alice"]);
        expect(game.playComputer(1, "d7d5")).toBe(false);
        // The computer plays on: there's no draw to offer it
        expect(game.offerDraw("alice")).toEqual({
            ok: false,
            error: "The computer plays on: resign to end the game",
        });
        expect(game.resign("alice").ok).toBe(true);
        expect(game.result()).toBe("White resigned");
        expect(game.computerTurn()).toBeUndefined();
    });

    it("loses on time if its flag falls before its move comes, which changes the game", () => {
        let now = START;
        const game = ChessGame.create({
            now: () => now,
            settings: { opponent: 8, white: WHITE_IS_HOST, minutes: 1 },
            host: { id: "alice", name: "Alice" },
        });
        game.join("alice", "Alice");
        game.start();
        game.move("alice", "e2e4");
        expect(game.playComputer(1, "e7e5")).toBe(true);
        game.move("alice", "d2d4");
        now += 20_000;
        // Its clock runs from its second move
        expect(game.computerTurn()?.timeLeftMs).toBe(40_000);
        now += 41_000;
        expect(game.playComputer(3, "d7d5")).toBe(true);
        expect(game.phase).toBe("finished");
        expect(game.match?.moves).toEqual(["e4", "e5", "d4"]);
        expect(game.computerTurn()).toBeUndefined();
    });

    it("moves first as White", () => {
        const { game } = against(1, WHITE_IS_OPPONENT);
        expect(game.start()).toEqual(["alice"]);
        expect(game.white).toBe(COMPUTER);
        expect(game.computerTurn()?.ply).toBe(0);
        expect(game.playComputer(0, "d2d4")).toBe(true);
        expect(game.waitingFor()).toEqual(["alice"]);
    });

    it("is read back from the store as it was", () => {
        const { game } = against(6);
        game.start();
        game.move("alice", "e2e4");
        const read = new ChessGame(JSON.parse(JSON.stringify(game.toJson())));
        // The game read back keeps time by the real clock, not this test's
        expect(read.computerTurn()).toEqual({
            ...game.computerTurn(),
            timeLeftMs: expect.any(Number),
        });
    });

    it("is chess between people unless chosen", () => {
        const game = ChessGame.create({ host: { id: "alice", name: "Alice" } });
        game.join("alice", "Alice");
        expect(game.join("bob", "Bob")).toBeUndefined();
        expect(game.computerLevel).toBeUndefined();
        game.start();
        expect(game.computerTurn()).toBeUndefined();
    });
});
