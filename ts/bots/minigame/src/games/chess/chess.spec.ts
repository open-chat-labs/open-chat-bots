import { describe, expect, it } from "vitest";
import { jsonBytes, MAX_END_STATE_BYTES } from "../game";
import { ChessGame, fitEndState } from "./chess";
import { STATE_VERSION, TIME_PER_SIDE_MS, type EndState } from "./types";

const START = 1_000_000;

function clock(start = START) {
    let now = start;
    return { now: () => now, tick: (ms: number) => (now += ms) };
}

/** A game between alice (White) and bob (Black), started at START */
function started(firstIsWhite = true) {
    const time = clock();
    const game = ChessGame.create({ now: time.now, random: () => (firstIsWhite ? 0.9 : 0.1) });
    expect(game.join("alice", "Alice")).toBeUndefined();
    expect(game.join("bob", "Bob")).toBeUndefined();
    game.start();
    return { game, time };
}

describe("settings", () => {
    it("are the defaults unless chosen, and only the host changes them, before the start", () => {
        const game = ChessGame.create({
            settings: { minutes: 5 },
            host: { id: "alice", name: "Alice" },
        });
        expect(game.settings()).toEqual({ white: 0, minutes: 5, increment: 0 });
        // The host's name is known before they've joined
        expect(game.shared()).toMatchObject({
            settings: { white: 0, minutes: 5, increment: 0 },
            host: "alice",
            names: { alice: "Alice" },
        });
        expect(game.configure("bob", { increment: 2 })).toEqual({
            ok: false,
            error: "Only the host can change the settings",
        });
        expect(game.configure("alice", { increment: 2 })).toEqual({ ok: true });
        expect(game.settings()).toEqual({ white: 0, minutes: 5, increment: 2 });
        game.join("alice", "Alice");
        game.join("bob", "Bob");
        game.start();
        expect(game.configure("alice", { minutes: 1 })).toEqual({
            ok: false,
            error: "The game has started",
        });
    });

    it("gives each side the minutes set, and adds the increment after each move", () => {
        const time = clock();
        const game = ChessGame.create({
            now: time.now,
            random: () => 0.9,
            settings: { minutes: 3, increment: 2 },
        });
        game.join("alice", "Alice");
        game.join("bob", "Bob");
        game.start();
        expect(game.shared().clock).toMatchObject({ white_ms: 180_000, black_ms: 180_000 });
        time.tick(5000);
        expect(game.move("alice", "e2e4")).toMatchObject({ ok: true });
        // Five seconds spent, two given back
        expect(game.shared().clock).toMatchObject({ white_ms: 177_000, running: "black" });
        // The data keeps the increment, so a reload keeps it
        const copy = new ChessGame(JSON.parse(JSON.stringify(game.data)), { now: time.now });
        time.tick(1000);
        expect(copy.move("bob", "e7e5")).toMatchObject({ ok: true });
        expect(copy.shared().clock).toMatchObject({ black_ms: 181_000 });
    });

    it("lets the host choose who's White, when the host is playing; otherwise the coin does", () => {
        const host = (white: number, hostJoinsFirst: boolean, hostPlays = true) => {
            // The coin would make the second to join White
            const game = ChessGame.create({
                random: () => 0.1,
                settings: { white },
                host: { id: "host", name: "Host" },
            });
            const order = hostJoinsFirst ? ["host", "other"] : ["other", "host"];
            for (const id of hostPlays ? order : ["other", "third"]) game.join(id, id);
            game.start();
            return game.white;
        };
        expect(host(1, true)).toBe("host");
        expect(host(1, false)).toBe("host");
        expect(host(2, true)).toBe("other");
        expect(host(2, false)).toBe("other");
        // The coin: the second to join
        expect(host(0, true)).toBe("other");
        expect(host(1, true, false)).toBe("third");
    });
});

describe("joining and starting", () => {
    it("takes two, once each, until the game starts, and the coin says who is White", () => {
        const game = ChessGame.create({ random: () => 0.1, now: () => START });
        expect(game.phase).toBe("open");
        expect(game.cannotStart()).toBe("Chess needs two players");
        expect(game.join("alice", "Alice")).toBeUndefined();
        expect(game.join("alice", "Alice")).toBeUndefined();
        expect(game.join("carol", "Carol")).toBeUndefined();
        expect(game.leave("carol")).toBe(true);
        expect(game.leave("carol")).toBe(false);
        expect(game.join("bob", "Bob")).toBeUndefined();
        expect(game.join("carol", "Carol")).toBe("This game is for two");
        expect(game.isSeated("bob")).toBe(true);
        expect(game.isPlayer("bob")).toBe(false);
        expect(game.cannotStart()).toBeUndefined();
        expect(game.move("alice", "e2e4")).toEqual({ ok: false, error: "Start the game first" });
        expect(game.move("carol", "e2e4")).toEqual({ ok: false, error: "You're not playing" });
        expect(game.waitingFor()).toEqual([]);
        expect(game.shared()).toEqual({
            version: STATE_VERSION,
            game: "chess",
            status: "Open",
            players: ["alice", "bob"],
            names: { alice: "Alice", bob: "Bob" },
            white: null,
            black: null,
            settings: { white: 0, minutes: 10, increment: 0 },
            host: null,
        });

        // The coin came up below a half: the second to join is White
        expect(game.start()).toEqual(["bob", "alice"]);

        expect(game.phase).toBe("active");
        expect(game.white).toBe("bob");
        expect(game.black).toBe("alice");
        expect(game.waitingFor()).toEqual(["bob"]);
        expect(game.isPlayer("alice")).toBe(true);
        const shared = game.shared();
        expect(shared).toMatchObject({
            status: "Active",
            players: ["bob", "alice"],
            white: "bob",
            black: "alice",
            turn: "white",
            moves: [],
            last_move: null,
            check: false,
            draw_offer: null,
            result: null,
        });
        expect(shared.clock).toMatchObject({ white_ms: TIME_PER_SIDE_MS, running: "white" });
        expect(shared.legal_moves).toHaveLength(20);
        // Once started, no one else gets in, and starting again changes nothing
        expect(game.join("carol", "Carol")).toBe("The game has started");
        expect(game.start()).toEqual(["bob", "alice"]);
    });

    it("gives the first to join White when the coin comes up heads", () => {
        const { game } = started(true);
        expect(game.white).toBe("alice");
        expect(game.black).toBe("bob");
        expect(game.deadline()).toBe(START + TIME_PER_SIDE_MS);
    });
});

describe("playing", () => {
    it("plays each user's moves as their side, and says whose turn it is", () => {
        const { game, time } = started();
        expect(game.move("bob", "e7e5")).toEqual({ ok: false, error: "It's not your turn" });
        time.tick(1000);
        const moved = game.move("alice", "e2e4");
        expect(moved.ok).toBe(true);
        if (!moved.ok) return;
        expect(moved.shared.moves).toEqual(["e4"]);
        expect(moved.shared.turn).toBe("black");
        expect(game.waitingFor()).toEqual(["bob"]);
        expect(game.deadline()).toBe(START + 1000 + TIME_PER_SIDE_MS);
        time.tick(2000);
        const again = game.move("bob", "e7e5");
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        expect(again.shared.clock).toEqual({
            at: START + 3000,
            white_ms: TIME_PER_SIDE_MS - 1000,
            black_ms: TIME_PER_SIDE_MS - 2000,
            running: "white",
        });
        expect(game.move("carol", "a2a3")).toEqual({ ok: false, error: "You're not playing" });
        expect(game.move("alice", 42)).toEqual({ ok: false, error: "Send the move as UCI" });
        expect(game.move("alice", "a2a5")).toEqual({ ok: false, error: "a2a5 isn't a legal move" });
    });

    it("ends with the result and an end state on checkmate", () => {
        const { game, time } = started();
        for (const [who, uci] of [
            ["alice", "f2f3"],
            ["bob", "e7e5"],
            ["alice", "g2g4"],
        ] as const) {
            expect(game.move(who, uci).ok).toBe(true);
        }
        time.tick(1000);
        const mate = game.move("bob", "d8h4");
        expect(mate.ok).toBe(true);
        expect(game.phase).toBe("finished");
        expect(game.finishedAt).toBe(time.now());
        expect(game.result()).toBe("Black won by checkmate");
        expect(game.waitingFor()).toEqual([]);
        expect(game.deadline()).toBeUndefined();
        expect(game.shared()).toMatchObject({
            status: "Finished",
            result: "Black won by checkmate",
        });
        expect(game.endState()).toEqual({
            version: 1,
            game: "chess",
            result: "Black won by checkmate",
            white: "alice",
            black: "bob",
            names: { alice: "Alice", bob: "Bob" },
            moves: ["f3", "e5", "g4", "Qh4#"],
            // The pieces on the board, without the rest of the FEN
            fens: [
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
                "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR",
                "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR",
                "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR",
                "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR",
            ],
            last_move: { from: "d8", to: "h4" },
        });
        expect(game.move("alice", "e1f2")).toEqual({ ok: false, error: "The game has finished" });
    });

    it("lets a player resign, or agree a draw", () => {
        const { game } = started();
        const offered = game.offerDraw("bob");
        expect(offered.ok && offered.shared.draw_offer).toBe("black");
        // An offer doesn't change whose move it is
        expect(game.waitingFor()).toEqual(["alice"]);
        const agreed = game.offerDraw("alice");
        expect(agreed.ok && agreed.shared.result).toBe("Draw by agreement");
        expect(game.result()).toBe("Draw by agreement");
        expect(game.resign("alice")).toEqual({ ok: false, error: "The game has finished" });

        const other = started();
        const resigned = other.game.resign("alice");
        expect(resigned.ok).toBe(true);
        expect(other.game.result()).toBe("White resigned");
        expect(other.game.offerDraw("bob")).toEqual({ ok: false, error: "The game has finished" });
        expect(other.game.resign("carol")).toEqual({ ok: false, error: "You're not playing" });
    });

    it("flags the side to move at its deadline, through the sweep or any request", () => {
        const { game, time } = started();
        time.tick(1000);
        game.move("alice", "e2e4");
        const deadline = game.deadline()!;
        time.tick(deadline - time.now() - 1);
        expect(game.endIfTimeUp()).toBe(false);
        time.tick(1);
        expect(game.endIfTimeUp()).toBe(true);
        expect(game.endIfTimeUp()).toBe(false);
        expect(game.result()).toBe("White won on time");
        expect(game.finishedAt).toBe(deadline);
        expect(game.shared().clock).toMatchObject({ black_ms: 0, running: null });

        // A request that finds the time up ends the game instead
        const late = started();
        late.time.tick(TIME_PER_SIDE_MS);
        expect(late.game.move("alice", "e2e4")).toEqual({
            ok: false,
            error: "The game has finished",
        });
        expect(late.game.result()).toBe("Black won on time");
        expect(late.game.endState()).toMatchObject({ moves: [], fens: [expect.any(String)] });
    });

    it("a player who leaves a started game loses it by abandonment", () => {
        const { game } = started();
        expect(game.leave("carol")).toBe(false);
        expect(game.leave("bob")).toBe(true);
        expect(game.phase).toBe("finished");
        expect(game.result()).toBe("Black left the game");
        expect(game.leave("alice")).toBe(false);
        // Who played is as it was
        expect(game.shared().players).toEqual(["alice", "bob"]);
    });

    it("a leave after the flag fell leaves the result on time", () => {
        const { game, time } = started();
        time.tick(TIME_PER_SIDE_MS);
        // White's flag fell first: the game changed, but not to abandonment
        expect(game.leave("alice")).toBe(true);
        expect(game.result()).toBe("Black won on time");
        expect(game.finishedAt).toBe(time.now());
        expect(game.leave("bob")).toBe(false);
        expect(game.result()).toBe("Black won on time");
    });

    it("doesn't charge the side to move for the time the bot was down", () => {
        const { game, time } = started();
        time.tick(1000);
        game.move("alice", "e2e4");
        time.tick(4000);
        // Down for five minutes from here
        time.tick(5 * 60_000);
        expect(game.resume(5 * 60_000)).toBe(true);
        expect(game.shared().clock).toMatchObject({
            white_ms: TIME_PER_SIDE_MS - 1000,
            black_ms: TIME_PER_SIDE_MS - 4000,
            running: "black",
        });
        expect(game.deadline()).toBe(time.now() + TIME_PER_SIDE_MS - 4000);
        // Nothing to skip once the game's over, or before it starts
        game.resign("bob");
        expect(game.resume(1000)).toBe(false);
        expect(ChessGame.create().resume(1000)).toBe(false);
    });

    it("is rebuilt from its data", () => {
        const { game, time } = started();
        game.move("alice", "e2e4");
        game.offerDraw("alice");
        const copy = new ChessGame(JSON.parse(JSON.stringify(game.toJson())), { now: time.now });
        expect(copy.shared()).toEqual(game.shared());
        expect(copy.phase).toBe("active");
        expect(copy.white).toBe("alice");
        expect(copy.waitingFor()).toEqual(["bob"]);
        expect(copy.deadline()).toBe(game.deadline());
    });

    it("seq goes up with each state", () => {
        const game = ChessGame.create();
        expect(game.nextSeq()).toBe(1);
        expect(game.nextSeq()).toBe(2);
    });
});

describe("the end state", () => {
    // Positions a placement's size, one per ply: a synthetic game, so they needn't be legal
    const position = (ply: number) => `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/${ply}`;
    const endState = (plies: number): EndState => ({
        version: 1,
        game: "chess",
        result: "Draw by agreement",
        white: "alice",
        black: "bob",
        names: { alice: "Alice", bob: "Bob" },
        moves: Array.from({ length: plies }, (_, ply) => (ply % 2 === 0 ? "Nf3" : "Nf6")),
        fens: Array.from({ length: plies + 1 }, (_, ply) => position(ply)),
        last_move: { from: "g8", to: "f6" },
    });

    it("keeps every position of a game that fits in 16 KB", () => {
        const short = fitEndState(endState(40))!;
        expect(short.fens).toHaveLength(41);
        expect(short.truncated).toBeUndefined();
        expect(jsonBytes(short)).toBeLessThanOrEqual(MAX_END_STATE_BYTES);
    });

    it("keeps only the final position of a very long game", () => {
        const long = fitEndState(endState(600))!;
        expect(long.truncated).toBe(true);
        expect(long.fens).toEqual([position(600)]);
        expect(long.moves).toHaveLength(600);
        expect(long.result).toBe("Draw by agreement");
        expect(jsonBytes(long)).toBeLessThanOrEqual(MAX_END_STATE_BYTES);
    });

    it("is still over the limit when even the final position won't fit, so the publisher sends none", () => {
        const state = endState(4000);
        const fitted = fitEndState(state);
        expect(fitted.truncated).toBe(true);
        expect(fitted.fens).toEqual([position(4000)]);
        expect(jsonBytes(fitted)).toBeGreaterThan(MAX_END_STATE_BYTES);
    });

    it("measures bytes, not UTF-16 units", () => {
        const state = endState(0);
        state.names.alice = "é".repeat(100);
        expect(jsonBytes(state)).toBe(JSON.stringify(state).length + 100);
    });
});
