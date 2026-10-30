import { GroupChatIdentifier, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChessGame } from "./games/chess/chess";
import { TIME_PER_SIDE_MS } from "./games/chess/types";
import { Race2048 } from "./games/race2048/race";
import { GameStore } from "./store";

const chessCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };
const raceCard: MiniAppGame = {
    chat: new GroupChatIdentifier("aaaaa-aa"),
    thread: 3,
    messageId: 2n,
};

let dir: string | undefined;

afterEach(() => {
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the store", () => {
    it("writes each game with its kind and reads it back as the right game", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "minigame-store-"));
        const file = path.join(dir, "games.json");
        const store = new GameStore(file);
        const now = () => 1_000_000;
        const chess = ChessGame.create({ random: () => 0.9, now });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        chess.move("alice", "e2e4");
        store.create(chessCard, chess);
        const race = Race2048.create({ now });
        race.takeSeat("carol", "Carol");
        store.create(raceCard, race);
        store.apiGateway = "umunu-kh777-77774-qaaca-cai";
        store.flush();

        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        expect(
            Object.values(json.games)
                .map((g: any) => g.kind)
                .sort(),
        ).toEqual(["2048", "chess"]);

        const loaded = new GameStore(file);
        expect(loaded.size).toBe(2);
        expect(loaded.apiGateway).toBe("umunu-kh777-77774-qaaca-cai");
        const chessAgain = new ChessGame(loaded.get(chessCard)!.play.toJson() as never, { now });
        expect(loaded.get(chessCard)!.play).toBeInstanceOf(ChessGame);
        expect(chessAgain.kind).toBe("chess");
        expect(chessAgain.shared()).toEqual(chess.shared());
        expect(chessAgain.waitingFor()).toEqual(["bob"]);
        const raceAgain = loaded.get(raceCard)!.play;
        expect(raceAgain).toBeInstanceOf(Race2048);
        expect(raceAgain.shared()).toEqual(race.shared());
    });

    /**
     * A chess game between alice (White) and bob (Black) saved at `savedAt`, four seconds into
     * Black's move, as a store writing to `file` with a clock the test moves, plus an open one and
     * a finished one
     */
    function savedMidMove(file: string) {
        let now = 1_000_000;
        const clock = () => now;
        const store = new GameStore(file, clock);
        const chess = ChessGame.create({ random: () => 0.9, now: clock });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        now += 1000;
        chess.move("alice", "e2e4");
        store.create(chessCard, chess);
        const open = ChessGame.create({ now: clock });
        open.join("carol", "Carol");
        const openCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 3n };
        store.create(openCard, open);
        const finished = ChessGame.create({ random: () => 0.9, now: clock });
        finished.join("dave", "Dave");
        finished.join("erin", "Erin");
        finished.start();
        finished.resign("dave");
        const finishedCard: MiniAppGame = {
            chat: new GroupChatIdentifier("aaaaa-aa"),
            messageId: 4n,
        };
        store.create(finishedCard, finished);
        now += 4000;
        store.flush();
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        expect(json.savedAt).toBe(now);
        return { savedAt: now, chess, openCard, finishedCard };
    }

    /** The loaded chess game, on the loading store's clock */
    function loadedChess(loaded: GameStore, now: () => number): ChessGame {
        return new ChessGame(loaded.get(chessCard)!.play.toJson() as never, { now });
    }

    it("doesn't charge the side to move for the time the bot was down", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "minigame-store-"));
        const file = path.join(dir, "games.json");
        const { savedAt, chess, openCard, finishedCard } = savedMidMove(file);
        const before = chess.shared().clock;
        expect(before).toMatchObject({ black_ms: TIME_PER_SIDE_MS - 4000, running: "black" });

        // Loaded five minutes later
        const later = savedAt + 5 * 60_000;
        const loaded = new GameStore(file, () => later);

        const again = loadedChess(loaded, () => later);
        expect(again.shared().clock).toEqual({ ...before, at: later });
        expect(again.deadline()).toBe(later + TIME_PER_SIDE_MS - 4000);
        // Only the game whose clock was running is published again
        expect(loaded.resumedOnLoad.map((e) => e.game.messageId)).toEqual([chessCard.messageId]);
        expect(loaded.get(openCard)!.play.phase).toBe("open");
        expect(loaded.get(finishedCard)!.play.phase).toBe("finished");
    });

    it("doesn't flag a game whose deadline passed while the bot was down", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "minigame-store-"));
        const file = path.join(dir, "games.json");
        const { savedAt } = savedMidMove(file);

        // Loaded after Black's ten minutes would have run out
        const later = savedAt + TIME_PER_SIDE_MS + 60_000;
        const loaded = new GameStore(file, () => later);

        const again = loadedChess(loaded, () => later);
        expect(again.endIfTimeUp()).toBe(false);
        expect(again.phase).toBe("active");
        expect(again.shared().clock).toMatchObject({
            black_ms: TIME_PER_SIDE_MS - 4000,
            running: "black",
        });
        // The skip is written back, so another stop doesn't skip the same time again
        loaded.flush();
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        expect(json.savedAt).toBe(later);
        expect(json.games[Object.keys(json.games)[0]].data.match.clock.since).toBe(later - 4000);
    });

    it("loads a file from before it said when it was written as just saved", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "minigame-store-"));
        const file = path.join(dir, "games.json");
        const { savedAt, chess } = savedMidMove(file);
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        delete json.savedAt;
        fs.writeFileSync(file, JSON.stringify(json));

        const later = savedAt + 5 * 60_000;
        const loaded = new GameStore(file, () => later);

        expect(loaded.resumedOnLoad).toEqual([]);
        expect(loadedChess(loaded, () => later).deadline()).toBe(chess.deadline());
    });

    it("prunes finished games after two hours and unfinished ones after a day", () => {
        let now = 1_000_000;
        const store = new GameStore(undefined, () => now);
        const chess = ChessGame.create({ now: () => now });
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        chess.resign("alice");
        store.create(chessCard, chess);
        store.create(raceCard, Race2048.create({ now: () => now }));
        now += 2 * 60 * 60 * 1000 + 1;
        expect(store.prune()).toBe(1);
        expect(store.get(chessCard)).toBeUndefined();
        now += 23 * 60 * 60 * 1000;
        expect(store.prune()).toBe(1);
        expect(store.size).toBe(0);
    });
});
