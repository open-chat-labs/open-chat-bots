import { GroupChatIdentifier, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChessGame } from "./games/chess/chess";
import { Race2048 } from "./games/race2048/race";
import { GameStore } from "./store";

const chessCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };
const raceCard: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), thread: 3, messageId: 2n };

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
        expect(Object.values(json.games).map((g: any) => g.kind).sort()).toEqual(["2048", "chess"]);

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
