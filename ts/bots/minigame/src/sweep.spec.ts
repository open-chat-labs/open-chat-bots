import { GroupChatIdentifier, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { describe, expect, it, vi } from "vitest";
import { ChessGame } from "./games/chess/chess";
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
        now += 1000;
        chess.move("alice", "e2e4");
        store.create(chessCard, chess);
        // A race with longer than the chess clocks, so the two end at different sweeps
        const race = Race2048.create({ now: clock, timeLimit: 2 * TIME_PER_SIDE_MS });
        race.takeSeat("carol", "Carol");
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
        expect(race.result()).toBe("Time's up after 20m 0s: Carol won with 0 points");
        expect(endGamesOutOfTime(store, publisher)).toBe(0);
    });
});
