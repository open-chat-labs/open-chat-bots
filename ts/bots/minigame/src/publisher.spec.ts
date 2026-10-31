import {
    GroupChatIdentifier,
    type MiniAppGame,
    type MiniAppGameUpdate,
    type MiniAppServiceClient,
} from "@open-ic/openchat-botclient-ts";
import { describe, expect, it, vi } from "vitest";
import { ChessGame } from "./games/chess/chess";
import { MAX_END_STATE_BYTES, type Game } from "./games/game";
import { Race2048 } from "./games/race2048/race";
import { TIME_LIMIT_MS } from "./games/race2048/types";
import { Publisher } from "./publisher";
import { GameStore } from "./store";

/** A finished game of no kind the bot knows, with whatever end state the test gives it */
function finishedGame(endState: unknown): Game {
    return {
        kind: "chess",
        phase: "finished",
        createdAt: 0,
        finishedAt: 1,
        isSeated: () => false,
        isPlayer: () => false,
        join: () => "The game has finished",
        leave: () => false,
        cannotStart: () => undefined,
        start: () => [],
        waitingFor: () => [],
        endIfTimeUp: () => false,
        resume: () => false,
        nextSeq: () => 1,
        shared: () => ({ version: 1, game: "fake" }),
        result: () => "Somebody won",
        endState: () => endState,
        toJson: () => ({}),
    };
}

const game: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };

function setUp() {
    const updates: MiniAppGameUpdate[] = [];
    const client = {
        update: vi.fn(async (update: MiniAppGameUpdate) => {
            updates.push(update);
        }),
    } as unknown as MiniAppServiceClient;
    const store = new GameStore();
    const publisher = new Publisher(() => client, store, 0);
    return { updates, store, publisher };
}

async function published(updates: MiniAppGameUpdate[], count: number): Promise<void> {
    await vi.waitFor(() => expect(updates).toHaveLength(count));
}

describe("publisher", () => {
    it("publishes the shared state, with no end state while the race is on", async () => {
        const { updates, store, publisher } = setUp();
        const race = Race2048.create();
        race.takeSeat("alice", "Alice");
        store.create(game, race);

        publisher.publish(game);
        await published(updates, 1);

        expect(updates[0]).toEqual({ game, state: { seq: 1, shared: race.shared() } });
        expect(updates[0].status).toBeUndefined();
        expect(updates[0].endState).toBeUndefined();
    });

    it("ends the card with the result and the final shared state as the end state", async () => {
        const { updates, store, publisher } = setUp();
        let now = 1_000_000;
        const race = Race2048.create({ now: () => now });
        race.takeSeat("alice", "Alice");
        race.takeSeat("bob", "Bob");
        race.start();
        race.data.players[1].score = 5432;
        race.data.players[1].best = 5432;
        now += TIME_LIMIT_MS;
        expect(race.endIfTimeUp()).toBe(true);
        store.create(game, race);

        publisher.publish(game);
        await published(updates, 1);

        const update = updates[0];
        expect(update.status).toBe("finished");
        expect(update.result).toBe("Time's up! @UserId(bob) won with 5,432 points");
        // The end state is the final shared state: every board, the winner and the times
        const shared = race.shared();
        expect(update.endState).toEqual({ ...shared, names: { alice: "Alice", bob: "Bob" } });
        expect(update.state?.shared).toEqual(shared);
        expect(shared.phase).toBe("finished");
        expect(shared.winner).toBe("bob");
        expect(shared.racers).toHaveLength(2);
        // The names, which the live state leaves out
        expect(update.endState).toMatchObject({ names: { alice: "Alice", bob: "Bob" } });
        expect(shared.names).toBeUndefined();
        expect(shared.finishedAt).toBe(now);
        // Well within the end state's 16 KB, with every board: bytes, not UTF-16 units
        expect(Buffer.byteLength(JSON.stringify(update.endState))).toBeLessThan(16 * 1024);
    });

    it("tells the card whose turn it is in a chess game, and ends it with the moves", async () => {
        const { updates, store, publisher } = setUp();
        const chess = ChessGame.create({ random: () => 0.9 });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        store.create(game, chess);

        // The lobby: no one's turn
        publisher.publish(game);
        await published(updates, 1);
        expect(updates[0].waitingFor).toBeUndefined();

        chess.start();
        chess.move("alice", "e2e4");
        publisher.publish(game);
        await published(updates, 2);
        expect(updates[1].waitingFor).toEqual(["bob"]);
        expect(updates[1].status).toBeUndefined();
        expect(updates[1].state?.shared).toMatchObject({ moves: ["e4"] });

        chess.resign("bob");
        publisher.publish(game);
        await published(updates, 3);
        expect(updates[2].waitingFor).toBeUndefined();
        expect(updates[2].status).toBe("finished");
        expect(updates[2].result).toBe("Black resigned");
        expect(updates[2].endState).toMatchObject({
            version: 1,
            game: "chess",
            result: "Black resigned",
            white: "alice",
            black: "bob",
            moves: ["e4"],
        });
        expect((updates[2].endState as { fens: string[] }).fens).toHaveLength(2);
    });

    it("publishes every unfinished game as the bot starts, and no finished one", async () => {
        const { updates, store, publisher } = setUp();
        const finished: MiniAppGame = { ...game, messageId: 2n };
        const running: MiniAppGame = { ...game, messageId: 3n };
        store.create(game, Race2048.create());
        store.create(finished, finishedGame(undefined));
        const chess = ChessGame.create();
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        store.create(running, chess);

        publisher.publishUnfinished();
        await published(updates, 2);

        expect(updates.map((update) => update.game.messageId)).toEqual([1n, 3n]);
        expect(updates.every((update) => update.status === undefined)).toBe(true);
    });

    it("sends no end state over 16 KB, whatever the game, but still ends the card", async () => {
        const { updates, store, publisher } = setUp();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            store.create(game, finishedGame({ big: "x".repeat(MAX_END_STATE_BYTES) }));
            publisher.publish(game);
            await published(updates, 1);
            expect(updates[0].status).toBe("finished");
            expect(updates[0].result).toBe("Somebody won");
            expect(updates[0].endState).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);

            // One that just fits goes, measured in bytes: the "é"s are two each
            const other: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 2n };
            const fits = { big: "é".repeat(MAX_END_STATE_BYTES / 2 - 5) };
            expect(Buffer.byteLength(JSON.stringify(fits))).toBe(MAX_END_STATE_BYTES);
            store.create(other, finishedGame(fits));
            publisher.publish(other);
            await published(updates, 2);
            expect(updates[1].endState).toEqual(fits);
        } finally {
            warn.mockRestore();
        }
    });
});
