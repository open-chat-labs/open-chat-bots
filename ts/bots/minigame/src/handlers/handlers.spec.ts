// The MiniApp service's calls and the app's requests, for chess, a race and a duel, with the tokens'
// verification stubbed: what each answers, and what it does to the game
import {
    GroupChatIdentifier,
    type MiniAppGame,
    type MiniAppPlayerClaims,
    type MiniAppStartResponse,
    type MiniAppTokens,
} from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { Deps } from "../deps";
import { ChessGame } from "../games/chess/chess";
import type { SharedState } from "../games/chess/types";
import { CrateRace } from "../games/crates/race";
import { LEVEL } from "../games/crates/sample";
import type { SharedState as CratesState } from "../games/crates/types";
import { Duel } from "../games/duel/duel";
import type { DuelState } from "../games/duel/types";
import { FOUR_IN_A_ROW } from "../games/fourinarow/rules";
import { wayOut } from "../games/maze/maze";
import { MazeRace } from "../games/maze/race";
import type { SharedState as MazeState } from "../games/maze/types";
import { mineCells } from "../games/minesweeper/field";
import { MinesweeperRace } from "../games/minesweeper/race";
import type { ActResponse, SharedState as MinesState } from "../games/minesweeper/types";
import { REVERSI } from "../games/reversi/rules";
import { Race2048 } from "../games/race2048/race";
import {
    MAX_PLAYERS,
    type MoveResponse,
    type SharedState as RaceState,
} from "../games/race2048/types";
import { WordRace } from "../games/words/race";
import type { SharedState as WordsState } from "../games/words/types";
import { GameStore } from "../store";
import {
    chessDraw,
    chessMove,
    chessResign,
    cratesPath,
    duelMove,
    duelResign,
    mazeMove,
    minesweeperAct,
    raceMove,
    raceRestart,
    userNames,
    wordsGuess,
} from "./api";
import { join, leave, start } from "./miniApp";

const game: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };

function setUp() {
    const store = new GameStore();
    const publish = vi.fn();
    // Every verification gives the claims of whoever the request says it's from
    const tokens = {
        verifyJoin: (h: unknown) => claims(h),
        verifyLeave: (h: unknown) => claims(h),
        verifyStart: (h: unknown) => claims(h),
        verifyPlayer: (h: unknown) => claims(h),
    } as unknown as MiniAppTokens;
    const deps = {
        store,
        publisher: { publish },
        names: {
            lookup: async (id: string) => id.toUpperCase(),
            username: async (id: string) => (id === "nobody" ? undefined : id.toLowerCase()),
        },
        tokens: async () => tokens,
    } as unknown as Deps;
    return { store, publish, deps };
}

function claims(header: unknown): MiniAppPlayerClaims {
    return { bot: "bot", game, userId: header as string };
}

type Answer = { status: number; body: unknown };

async function send(
    handler: (req: Request, res: Response, deps: Deps) => Promise<void>,
    deps: Deps,
    userId: string,
    body?: unknown,
): Promise<Answer> {
    const answer: Answer = { status: 200, body: undefined };
    const res = {
        status(code: number) {
            answer.status = code;
            return res;
        },
        json(value: unknown) {
            answer.body = value;
            return res;
        },
    } as unknown as Response;
    await handler({ headers: { "x-oc-jwt": userId }, body } as unknown as Request, res, deps);
    return answer;
}

/** A chess game with alice and bob seated, alice White */
function seated(deps: Deps, store: GameStore) {
    const chess = ChessGame.create({ random: () => 0.9 });
    store.create(game, chess);
    return chess;
}

describe("the service's calls for a chess game", () => {
    it("joins two, with their names, then refuses the third", async () => {
        const { store, publish, deps } = setUp();
        seated(deps, store);
        expect(await send(join, deps, "alice")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "bob")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "This game is for two" },
        });
        expect(publish).toHaveBeenCalledTimes(2);
        expect((store.get(game)!.play.shared() as SharedState).names).toEqual({
            alice: "ALICE",
            bob: "BOB",
        });
    });

    it("needs two to start, and the starter to be one of them", async () => {
        const { store, deps } = setUp();
        seated(deps, store);
        await send(join, deps, "alice");
        expect(await send(start, deps, "alice")).toEqual({
            status: 200,
            body: { accepted: false, message: "Chess needs two players" },
        });
        expect(await send(start, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "Join the game before starting it" },
        });
        await send(join, deps, "bob");

        const started = (await send(start, deps, "bob")).body as MiniAppStartResponse;

        expect(started.accepted).toBe(true);
        if (!started.accepted) return;
        // White first, and White to move
        expect(started.players).toEqual(["alice", "bob"]);
        expect(started.waiting_for).toEqual(["alice"]);
        expect(started.state?.seq).toBe(1);
        expect(started.state?.shared).toMatchObject({
            status: "Active",
            turn: "white",
            white: "alice",
        });
        // No one else gets in now
        expect(await send(join, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "The game has started" },
        });
        // Starting again, eg. as the first answer was lost, gives the players as they are
        const again = (await send(start, deps, "alice")).body as MiniAppStartResponse;
        expect(again).toMatchObject({
            accepted: true,
            players: ["alice", "bob"],
            waiting_for: ["alice"],
        });
        expect(await send(start, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "You're not in this game" },
        });
    });

    it("frees a seat left before the start, and ends the game by abandonment after it", async () => {
        const { store, publish, deps } = setUp();
        seated(deps, store);
        await send(join, deps, "alice");
        await send(join, deps, "carol");
        expect(await send(leave, deps, "carol")).toEqual({ status: 200, body: {} });
        expect(store.get(game)!.play.isSeated("carol")).toBe(false);
        // Whether or not they had a seat
        expect(await send(leave, deps, "nobody")).toEqual({ status: 200, body: {} });
        await send(join, deps, "bob");
        await send(start, deps, "alice");
        publish.mockClear();

        expect(await send(leave, deps, "bob")).toEqual({ status: 200, body: {} });

        const play = store.get(game)!.play;
        expect(play.phase).toBe("finished");
        expect(play.result()).toBe("Black left the game");
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("answers a game it doesn't know", async () => {
        const { deps } = setUp();
        expect(await send(join, deps, "alice")).toEqual({
            status: 200,
            body: { accepted: false, message: "This game is over" },
        });
        expect((await send(start, deps, "alice")).body).toEqual({
            accepted: false,
            message: "This game is over",
        });
    });
});

describe("the app's requests for a chess game", () => {
    async function started() {
        const set = setUp();
        seated(set.deps, set.store);
        await send(join, set.deps, "alice");
        await send(join, set.deps, "bob");
        await send(start, set.deps, "alice");
        set.publish.mockClear();
        return set;
    }

    it("plays a move, answering the new state, and publishes it", async () => {
        const { publish, deps } = await started();
        const answer = await send(chessMove, deps, "alice", { uci: "e2e4" });
        expect(answer.status).toBe(200);
        expect(answer.body).toMatchObject({ ok: true, shared: { moves: ["e4"], turn: "black" } });
        expect(publish).toHaveBeenCalledTimes(1);

        // Out of turn, or not a move: a 409, and nothing published
        expect(await send(chessMove, deps, "alice", { uci: "d2d4" })).toEqual({
            status: 409,
            body: { ok: false, error: "It's not your turn" },
        });
        expect(await send(chessMove, deps, "bob", {})).toEqual({
            status: 409,
            body: { ok: false, error: "Send the move as UCI" },
        });
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("refuses someone who isn't playing, and a request for the wrong game", async () => {
        const { deps } = await started();
        expect(await send(chessMove, deps, "carol", { uci: "e2e4" })).toEqual({
            status: 403,
            body: { ok: false, error: "You aren't in this game" },
        });
        expect(await send(raceMove, deps, "alice", { direction: "left" })).toEqual({
            status: 409,
            body: { ok: false, error: "This isn't a 2048 game" },
        });
    });

    it("resigns, and offers and accepts a draw", async () => {
        const { deps, store } = await started();
        const offered = await send(chessDraw, deps, "bob");
        expect(offered.body).toMatchObject({ ok: true, shared: { draw_offer: "black" } });
        const agreed = await send(chessDraw, deps, "alice");
        expect(agreed.body).toMatchObject({ ok: true, shared: { result: "Draw by agreement" } });
        expect(store.get(game)!.play.phase).toBe("finished");

        const other = await started();
        const resigned = await send(chessResign, other.deps, "bob");
        expect(resigned.body).toMatchObject({
            ok: true,
            shared: { result: "Black resigned" },
        });
        expect(await send(chessResign, other.deps, "bob")).toEqual({
            status: 409,
            body: { ok: false, error: "The game has finished" },
        });
    });

    it("answers a game it doesn't know with a 404", async () => {
        const { deps } = setUp();
        expect(await send(chessMove, deps, "alice", { uci: "e2e4" })).toEqual({
            status: 404,
            body: { ok: false, error: "This game is over" },
        });
    });
});

describe("a race through the same handlers", () => {
    function race(store: GameStore): Race2048 {
        const play = Race2048.create({ random: () => 0.5 });
        store.create(game, play);
        return play;
    }

    /** `GET /api/names?ids=<ids>`, which has no token */
    async function names(deps: Deps, ids: unknown): Promise<Answer> {
        const answer: Answer = { status: 200, body: undefined };
        const res = {
            status(code: number) {
                answer.status = code;
                return res;
            },
            json(body: unknown) {
                answer.body = body;
            },
            setHeader() {},
        };
        await userNames(
            { headers: {}, query: { ids } } as unknown as Request,
            res as unknown as Response,
            deps,
        );
        return answer;
    }

    /** A full board with nothing to merge, so no move to the left changes it */
    const packed = [2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128];

    it("joins, starts with everyone seated, and goes on without someone who leaves", async () => {
        const { store, publish, deps } = setUp();
        race(store);
        expect(await send(join, deps, "alice")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "bob")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "carol")).toEqual({ status: 200, body: { accepted: true } });
        // A seat given up before the start
        expect(await send(leave, deps, "carol")).toEqual({ status: 200, body: {} });
        expect(publish).toHaveBeenCalledTimes(4);
        expect(await send(start, deps, "dave")).toEqual({
            status: 200,
            body: { accepted: false, message: "Join the game before starting it" },
        });

        const started = (await send(start, deps, "alice")).body as MiniAppStartResponse;

        expect(started.accepted).toBe(true);
        if (!started.accepted) return;
        expect(started.players).toEqual(["alice", "bob"]);
        // Everyone's turn at once
        expect(started.waiting_for).toEqual([]);
        expect(started.state?.shared).toMatchObject({ phase: "active" });
        expect((started.state?.shared as RaceState).racers.map((r) => r.i)).toEqual([
            "alice",
            "bob",
        ]);
        expect(await send(join, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "The race has already started" },
        });
        // Someone who isn't racing can't start it again; a racer gets the players as they are
        expect(await send(start, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "You're not in this game" },
        });
        expect((await send(start, deps, "bob")).body).toMatchObject({
            accepted: true,
            players: ["alice", "bob"],
        });

        // A racer who leaves keeps racing: nothing changed, nothing published
        publish.mockClear();
        expect(await send(leave, deps, "bob")).toEqual({ status: 200, body: {} });
        expect(store.get(game)!.play.isPlayer("bob")).toBe(true);
        expect(publish).not.toHaveBeenCalled();
    });

    it("gives usernames by id, with no token, leaving out anyone OpenChat doesn't know", async () => {
        const { deps } = setUp();
        expect(await names(deps, "alice,bob,nobody")).toEqual({
            status: 200,
            body: { names: { alice: "alice", bob: "bob" } },
        });
    });

    it("refuses a lookup of nothing, of too many, or of what can't be a user id", async () => {
        const { deps } = setUp();
        const full = Array.from({ length: MAX_PLAYERS }, (_, i) => `user${i}`);
        expect((await names(deps, full.join(","))).status).toBe(200);
        expect((await names(deps, [...full, "one-more"].join(","))).status).toBe(400);
        expect((await names(deps, undefined)).status).toBe(400);
        expect((await names(deps, "")).status).toBe(400);
        expect((await names(deps, ["alice", "bob"])).status).toBe(400);
        expect((await names(deps, "alice,__proto__")).status).toBe(400);
    });

    it("moves and restarts a racer's board, publishing each change", async () => {
        const { store, publish, deps } = setUp();
        const play = race(store);
        await send(join, deps, "alice");
        await send(join, deps, "bob");
        await send(start, deps, "alice");
        publish.mockClear();

        // A move that moves something answers the board, with its new tile, and is published. A
        // fresh board has two tiles, which `random` at a half puts in the middle of its cells.
        const moved = await send(raceMove, deps, "alice", { direction: "left" });
        expect(moved.status).toBe(200);
        const result = moved.body as MoveResponse;
        expect(result).toMatchObject({ ok: true, moved: true, phase: "active" });
        if (!result.ok) return;
        expect(result.player.rev).toBe(1);
        expect(play.data.players[0].board).toEqual(result.player.board);
        expect(publish).toHaveBeenCalledTimes(1);

        // A move that moves nothing is answered but changes nothing, so nothing's published
        play.data.players[0].board = [...packed];
        const stuck = await send(raceMove, deps, "alice", { direction: "left" });
        expect(stuck.body).toMatchObject({ ok: true, moved: false, player: { rev: 1 } });
        expect(play.data.players[0].board).toEqual(packed);
        expect(publish).toHaveBeenCalledTimes(1);

        // Not a direction, and someone who isn't racing
        expect(await send(raceMove, deps, "alice", { direction: "sideways" })).toEqual({
            status: 409,
            body: { ok: false, error: "Not a direction" },
        });
        expect(await send(raceMove, deps, "carol", { direction: "left" })).toEqual({
            status: 403,
            body: { ok: false, error: "You aren't in this game" },
        });

        // A restart deals a fresh board, counted against the racer
        const restarted = await send(raceRestart, deps, "bob");
        expect(restarted.body).toMatchObject({
            ok: true,
            moved: true,
            player: { id: "bob", restarts: 1, rev: 1, score: 0 },
        });
        expect(publish).toHaveBeenCalledTimes(2);
        expect((store.get(game)!.play.shared() as RaceState).racers[1].r).toBe(1);
    });
});

describe("a duel through the same handlers", () => {
    const move = duelMove("four-in-a-row");
    const resign = duelResign("four-in-a-row");

    it("seats two, starts, plays and resigns, publishing each change", async () => {
        const { store, publish, deps } = setUp();
        store.create(game, Duel.create(FOUR_IN_A_ROW, { random: () => 0.9 }));
        expect(await send(join, deps, "alice")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "bob")).toEqual({ status: 200, body: { accepted: true } });
        expect(await send(join, deps, "carol")).toEqual({
            status: 200,
            body: { accepted: false, message: "This game is for two" },
        });
        const started = (await send(start, deps, "bob")).body as MiniAppStartResponse;
        expect(started).toMatchObject({
            accepted: true,
            players: ["alice", "bob"],
            waiting_for: ["alice"],
        });

        publish.mockClear();
        const played = await send(move, deps, "alice", { move: 3 });
        expect(played.status).toBe(200);
        expect((played.body as { shared: DuelState<number> }).shared.moves).toEqual([3]);
        expect(publish).toHaveBeenCalledTimes(1);
        // Out of turn: refused, and nothing to publish
        expect(await send(move, deps, "alice", { move: 3 })).toEqual({
            status: 409,
            body: { ok: false, error: "It's not your turn" },
        });
        expect(await send(move, deps, "bob", {})).toEqual({
            status: 409,
            body: { ok: false, error: "That isn't a move" },
        });
        expect(await send(move, deps, "carol", { move: 3 })).toMatchObject({ status: 403 });
        expect(publish).toHaveBeenCalledTimes(1);

        expect((await send(resign, deps, "bob")).status).toBe(200);
        expect(store.get(game)!.play.result()).toBe("@UserId(bob) resigned");
        expect(publish).toHaveBeenCalledTimes(2);
    });

    it("plays Reversi through the same requests, a move being a square", async () => {
        const { store, deps } = setUp();
        const reversi = Duel.create(REVERSI, { random: () => 0.9 });
        store.create(game, reversi);
        reversi.join("alice", "Alice");
        reversi.join("bob", "Bob");
        reversi.start();
        const reversiMove = duelMove("reversi");
        const played = await send(reversiMove, deps, "alice", { move: "d3" });
        expect((played.body as { shared: DuelState<string> }).shared.moves).toEqual(["d3"]);
        expect(await send(reversiMove, deps, "bob", { move: "a1" })).toEqual({
            status: 409,
            body: { ok: false, error: "A disc has to flip at least one of the other player's" },
        });
        expect(await send(reversiMove, deps, "bob", { move: 3 })).toEqual({
            status: 409,
            body: { ok: false, error: "That isn't a move" },
        });
        // A Four in a Row request for a Reversi game is refused
        expect((await send(move, deps, "bob", { move: 3 })).status).toBe(409);
    });

    it("refuses a duel's request for a game of another kind", async () => {
        const { store, deps } = setUp();
        const chess = seated(deps, store);
        chess.join("alice", "Alice");
        chess.join("bob", "Bob");
        chess.start();
        expect(await send(move, deps, "alice", { move: 3 })).toEqual({
            status: 409,
            body: { ok: false, error: "This isn't a four-in-a-row game" },
        });
    });
});

describe("a maze race's moves over HTTP, while a racer's socket isn't open", () => {
    it("takes a move as the socket does, answering the new state, and publishes it", async () => {
        const { store, publish, deps } = setUp();
        const race = MazeRace.create({ random: () => 0.25 });
        race.join("alice", "Alice");
        race.start();
        store.create(game, race);
        const [move] = wayOut(race.maze!);

        const moved = await send(mazeMove, deps, "alice", { move, n: 1 });
        expect(moved.status).toBe(200);
        expect((moved.body as { shared: MazeState }).shared.racers[0]).toMatchObject({ ack: 1 });
        expect(publish).toHaveBeenCalledTimes(1);
        // The same move again changes nothing, and publishes nothing
        expect((await send(mazeMove, deps, "alice", { move, n: 1 })).status).toBe(200);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(await send(mazeMove, deps, "alice", { move: "sideways", n: 2 })).toEqual({
            status: 409,
            body: { ok: false, error: "A move is a direction and its number", changed: false },
        });
        expect((await send(mazeMove, deps, "bob", { move, n: 1 })).status).toBe(403);
    });
});

describe("a Minesweeper racer's clicks", () => {
    it("answers with their board alone, and publishes only how far they've got", async () => {
        const { store, publish, deps } = setUp();
        const race = MinesweeperRace.create({ random: () => 0.25 });
        race.join("alice", "Alice");
        race.join("bob", "Bob");
        race.start();
        store.create(game, race);

        // No acts: the board as it is, which changes nothing
        const asked = await send(minesweeperAct, deps, "alice", { acts: [] });
        expect(asked).toEqual({ status: 200, body: { ok: true, own: race.own("alice") } });
        expect(publish).not.toHaveBeenCalled();

        const field = race.field!;
        const cell = [...race.own("alice")!.view].findIndex(
            (c, i) => c === "." && field.mine[i] === 0,
        );
        const opened = await send(minesweeperAct, deps, "alice", { acts: [{ reveal: cell }] });
        expect(opened.status).toBe(200);
        expect((opened.body as ActResponse).ok).toBe(true);
        expect(publish).toHaveBeenCalledTimes(1);
        const shared = store.get(game)!.play.shared() as MinesState;
        expect(shared.racers[0]).toMatchObject({ id: "alice", rev: 1 });
        expect(JSON.stringify(shared)).not.toContain(race.own("alice")!.view);

        // A mine: refused from then on, with the board
        const [mine] = mineCells(field);
        const blown = await send(minesweeperAct, deps, "alice", {
            acts: [{ reveal: mine }, { reveal: mine + 1 }],
        });
        expect(blown.status).toBe(409);
        expect(blown.body).toMatchObject({
            ok: false,
            error: "You set off a mine: wait 10s",
            own: { hits: 1 },
        });
        expect((await send(minesweeperAct, deps, "carol", { acts: [] })).status).toBe(403);
    });
});

describe("a Word racer's guesses", () => {
    it("answers with their guesses alone, and publishes only their marks", async () => {
        const { store, publish, deps } = setUp();
        const race = WordRace.create();
        race.join("alice", "Alice");
        race.join("bob", "Bob");
        race.start();
        race.data.word = "crane";
        store.create(game, race);

        // No guess: the guesses as they are, which changes nothing
        expect(await send(wordsGuess, deps, "alice", {})).toEqual({
            status: 200,
            body: { ok: true, own: { guesses: [], marks: [] } },
        });
        expect(publish).not.toHaveBeenCalled();

        const own = { guesses: ["trace"], marks: ["02212"] };
        expect(await send(wordsGuess, deps, "alice", { guess: "trace" })).toEqual({
            status: 200,
            body: { ok: true, own },
        });
        expect(publish).toHaveBeenCalledTimes(1);
        const shared = store.get(game)!.play.shared() as WordsState;
        expect(shared.racers[0]).toEqual({ id: "alice", marks: ["02212"] });
        expect(JSON.stringify(shared)).not.toMatch(/trace|crane/);

        // A word that isn't in the list: refused, with the guesses, and nothing published
        expect(await send(wordsGuess, deps, "alice", { guess: "qxzvj" })).toEqual({
            status: 409,
            body: { ok: false, error: "That isn't in the word list", own },
        });
        expect(publish).toHaveBeenCalledTimes(1);
        expect((await send(wordsGuess, deps, "carol", {})).status).toBe(403);
    });
});

describe("a Crate racer's moves", () => {
    it("answers with their path alone, and publishes only how far they've got", async () => {
        const { store, publish, deps } = setUp();
        const race = CrateRace.create();
        race.join("alice", "Alice");
        race.join("bob", "Bob");
        race.start();
        race.data.level = LEVEL;
        store.create(game, race);

        // No path: the path as it is, which changes nothing
        expect(await send(cratesPath, deps, "alice", {})).toEqual({
            status: 200,
            body: { ok: true, own: { path: "" } },
        });
        // A walk changes nothing anyone else sees, so nothing's published
        expect((await send(cratesPath, deps, "alice", { path: "d" })).status).toBe(200);
        expect(publish).not.toHaveBeenCalled();

        expect(await send(cratesPath, deps, "alice", { path: "rrr" })).toEqual({
            status: 200,
            body: { ok: true, own: { path: "rrr" } },
        });
        expect(publish).toHaveBeenCalledTimes(1);
        const shared = store.get(game)!.play.shared() as CratesState;
        expect(shared.racers[0]).toEqual({ id: "alice", placed: 1, pushes: 2 });

        // A move into a wall: refused, with the path the bot has, and nothing published
        expect(await send(cratesPath, deps, "alice", { path: "rrru" })).toEqual({
            status: 409,
            body: { ok: false, error: "One of those moves can't be made", own: { path: "rrr" } },
        });
        expect(publish).toHaveBeenCalledTimes(1);
        expect((await send(cratesPath, deps, "carol", {})).status).toBe(403);
    });
});
