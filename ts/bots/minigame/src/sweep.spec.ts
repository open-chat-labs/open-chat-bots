import { GroupChatIdentifier, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { describe, expect, it, vi } from "vitest";
import { ChatManRace } from "./games/chatman/race";
import { ChessGame } from "./games/chess/chess";
import { FIRST_MOVE_MS } from "./games/game";
import { TIME_PER_SIDE_MS } from "./games/chess/types";
import { Race2048 } from "./games/race2048/race";
import type { Publisher } from "./publisher";
import { GameStore } from "./store";
import { endGamesOutOfTime } from "./sweep";

const chessCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };
const raceCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 2n };

describe("the sweep", () => {
    it("ends the games whose clocks have run out, and publishes each end", () => {
        let now = 1_000_000;
        const clock = () => now;
        const store = new GameStore(undefined, clock);
        const publish = vi.fn();
        const publisher = { publish } as unknown as Publisher;

        const chess = ChessGame.create({ random: () => 0.9, now: clock });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        // Each side's first move, which their clocks don't run for, then White's second
        chess.move("alice", "e2e4");
        chess.move("bob", "e7e5");
        now += 1000;
        chess.move("alice", "g1f3");
        store.create(chessCard, chess);
        // A race with longer than the chess clocks, so the two end at different sweeps
        const race = Race2048.create({ now: clock, settings: { minutes: (2 * TIME_PER_SIDE_MS) / 60_000 } });
        race.join("carol", "Carol");
        race.start();
        store.create(raceCard, race);

        // Nothing's out of time yet
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
        expect(publish).not.toHaveBeenCalled();

        // Black's flag falls, ten minutes after White's move; the race has longer
        now += TIME_PER_SIDE_MS;
        expect(endGamesOutOfTime(store, publisher)).toBe(1);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(chessCard);
        expect(chess.phase).toBe("finished");
        expect(chess.result()).toBe("White won on time");
        expect(race.phase).toBe("active");

        // Then the race's time is up; the chess game is over already, so it isn't published again
        now = race.data.endsAt!;
        expect(endGamesOutOfTime(store, publisher)).toBe(1);
        expect(publish).toHaveBeenCalledTimes(2);
        expect(publish).toHaveBeenLastCalledWith(raceCard);
        expect(race.result()).toBe("Time's up! @UserId(carol) won with 0 points");
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
    });

    it("calls off a game whose first move isn't made in time, and publishes its end", () => {
        let now = 1_000_000;
        const clock = () => now;
        const store = new GameStore(undefined, clock);
        const publish = vi.fn();
        const publisher = { publish } as unknown as Publisher;

        const chess = ChessGame.create({ random: () => 0.9, now: clock });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        store.create(chessCard, chess);

        // No one asks the bot anything, so it's the sweep that ends it
        now += FIRST_MOVE_MS - 1;
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
        now += 1;
        expect(endGamesOutOfTime(store, publisher)).toBe(1);
        expect(publish).toHaveBeenCalledWith(chessCard);
        expect(chess.phase).toBe("finished");
        expect(chess.result()).toBe("Called off: White didn't make a first move");
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
    });

    it("publishes a game that's moved on by itself, as ChatMan's boards do, and saves it", () => {
        let now = 1_000_000;
        const clock = () => now;
        const store = new GameStore(undefined, clock);
        const save = vi.spyOn(store, "save");
        const publish = vi.fn();
        const publisher = { publish } as unknown as Publisher;
        const chatman = ChatManRace.create({ now: clock });
        chatman.join("alice", "Alice");
        chatman.start();
        store.create(raceCard, chatman);
        save.mockClear();

        // Still counting down: nothing's moved
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
        expect(publish).not.toHaveBeenCalled();

        now = chatman.data.playsAt! + 2000;
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
        expect(publish).toHaveBeenCalledWith(raceCard);
        expect(save).toHaveBeenCalled();
        // Not again until it moves again
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
        expect(publish).toHaveBeenCalledTimes(1);
    });
});
