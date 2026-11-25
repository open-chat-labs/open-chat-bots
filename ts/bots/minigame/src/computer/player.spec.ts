// The computer's side: a search when it's the computer's move, one at a time per game, the move
// played and published, and a move at random if the engine fails
import { GroupChatIdentifier, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { describe, expect, it, vi } from "vitest";
import { ChessGame } from "../games/chess/chess";
import { WHITE_IS_HOST, WHITE_IS_OPPONENT } from "../games/chess/settings";
import type { Publisher } from "../publisher";
import { GameStore } from "../store";
import type { Engine } from "./engine";
import { ComputerPlayer } from "./player";

const game: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };

function setUp(engine: Engine, white = WHITE_IS_OPPONENT) {
    const store = new GameStore();
    const chess = ChessGame.create({
        settings: { opponent: 2, white },
        host: { id: "alice", name: "Alice" },
    });
    chess.join("alice", "Alice");
    chess.start();
    store.create(game, chess);
    const publish = vi.fn();
    const publisher = { publish } as unknown as Publisher;
    const computer = new ComputerPlayer(engine, store, publisher, {
        minDelayMs: 0,
        random: () => 0,
    });
    return { chess, computer, publish };
}

describe("the computer", () => {
    it("plays its move once the engine finds it, and publishes it", async () => {
        const bestMove = vi.fn(async () => "e2e4");
        const { chess, computer, publish } = setUp({ bestMove });
        const first = computer.poke(game);
        // One search at a time
        expect(computer.isThinking(game)).toBe(true);
        await computer.poke(game);
        await first;
        expect(bestMove).toHaveBeenCalledTimes(1);
        expect(bestMove).toHaveBeenCalledWith(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            2,
        );
        expect(chess.match?.moves).toEqual(["e4"]);
        expect(publish).toHaveBeenCalledWith(game);
        expect(computer.isThinking(game)).toBe(false);
        // Now it's the human's move: nothing to do
        await computer.poke(game);
        expect(bestMove).toHaveBeenCalledTimes(1);
    });

    it("doesn't play a move found for a position that's moved on", async () => {
        let answer!: (move: string) => void;
        const engine = { bestMove: () => new Promise<string>((resolve) => (answer = resolve)) };
        const { chess, computer, publish } = setUp(engine);
        const poked = computer.poke(game);
        await Promise.resolve();
        chess.resign("alice");
        answer("e2e4");
        await poked;
        expect(chess.match?.moves).toEqual([]);
        expect(publish).not.toHaveBeenCalled();
    });

    it("plays a legal move at random if the engine fails", async () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { chess, computer, publish } = setUp({
            bestMove: async () => {
                throw new Error("No engine");
            },
        });
        await computer.poke(game);
        expect(chess.match?.moves).toHaveLength(1);
        expect(publish).toHaveBeenCalledWith(game);
        errors.mockRestore();
    });

    it("finds every game whose move is the computer's", async () => {
        const bestMove = vi.fn(async () => "e7e5");
        const { chess, computer } = setUp({ bestMove }, WHITE_IS_HOST);
        computer.pokeAll();
        expect(bestMove).not.toHaveBeenCalled();
        chess.move("alice", "e2e4");
        computer.pokeAll();
        await vi.waitFor(() => expect(chess.match?.moves).toEqual(["e4", "e5"]));
    });
});
