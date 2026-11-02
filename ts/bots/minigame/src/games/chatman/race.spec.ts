import { describe, expect, it } from "vitest";
import { ChatManRace, type ChatManData } from "./race";
import { Mazes, newBoard, pack, play, TICK_MS, type Board, type Turn } from "./rules";
import { AHEAD_TICKS, COUNTDOWN_MS, LAG_TICKS, MAX_PLAYERS, MAX_QUEUE } from "./types";

const MINUTE = 60_000;
const SEED = Math.floor(0.25 * 2 ** 31);

/** A game with alice and bob seated, on a clock the test moves */
function seated(settings = {}) {
    const clock = { now: 1_000_000 };
    const game = ChatManRace.create({
        now: () => clock.now,
        random: () => 0.25,
        settings,
        host: { id: "alice", name: "Alice" },
    });
    game.join("alice", "Alice");
    game.join("bob", "Bob");
    return { game, clock };
}

function started(settings = {}) {
    const s = seated(settings);
    s.game.start();
    return {
        ...s,
        /** Moves the clock to the game's tick `tick`, after the countdown */
        at(tick: number) {
            s.clock.now = s.game.data.playsAt! + tick * TICK_MS;
        },
    };
}

/** A board played from the start, as the page plays it */
function played(turns: Turn[], to: number, lives = 3): Board {
    const board = newBoard(SEED, lives);
    play(board, new Mazes(SEED), turns, to);
    return board;
}

describe("a ChatMan game", () => {
    it("seats up to ten, and frees a seat left before the start", () => {
        const game = ChatManRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(game.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(game.join("late", "Late")).toBe("All 10 places are taken");
        expect(game.leave("p3")).toBe(true);
        expect(game.isSeated("p3")).toBe(false);
        expect(ChatManRace.create().cannotStart()).toBe("Nobody has joined yet");
    });

    it("gives everyone the same board from a new seed, and counts down before it moves", () => {
        const { game, clock } = seated({ lives: 5 });
        const now = clock.now;
        expect(game.start()).toEqual(["alice", "bob"]);
        expect(game.join("carol", "Carol")).toBe("The game has started");
        const shared = game.shared();
        expect(shared).toMatchObject({
            phase: "active",
            seed: SEED,
            startedAt: now,
            playsAt: now + COUNTDOWN_MS,
            endsAt: now + COUNTDOWN_MS + 3 * MINUTE,
            names: { alice: "Alice", bob: "Bob" },
            now,
        });
        const board = pack(newBoard(SEED, 5), new Mazes(SEED).level(1));
        expect(shared.players).toEqual([
            { id: "alice", ack: 0, board, queue: [] },
            { id: "bob", ack: 0, board, queue: [] },
        ]);
        // Nothing moves in the countdown
        clock.now += COUNTDOWN_MS - 1;
        expect(game.tick()).toBe(false);
        expect(game.board("alice")!.t).toBe(0);
    });

    it("plays every board a little behind the clock, and says when they've moved", () => {
        const { game, at } = started();
        at(40);
        expect(game.tick()).toBe(true);
        expect(game.board("alice")).toEqual(played([], 40 - LAG_TICKS));
        expect(game.tick()).toBe(false);
        at(41);
        expect(game.tick()).toBe(true);
    });

    it("takes a player's turn at the tick they took it", () => {
        const { game, at } = started();
        at(20);
        expect(game.receive("alice", { turn: "up", n: 1, tick: 15 })).toEqual({ ok: true, changed: true });
        // Not reached yet: the bot's at 10
        expect(game.shared().players[0]).toMatchObject({ ack: 1, queue: [[1, 15, 0]] });
        at(40);
        game.tick();
        const turns = [{ n: 1, t: 15, d: 0 as const }];
        expect(game.board("alice")).toEqual(played(turns, 30));
        expect(game.board("bob")).toEqual(played([], 30));
        expect(game.shared().players[0].queue).toEqual([]);
    });

    it("takes a late turn as soon as it can, which the state shows", () => {
        const { game, at } = started();
        at(40);
        game.tick();
        // Taken at 12 on the page, but the bot's already at 30
        game.receive("alice", { turn: "down", n: 1, tick: 12 });
        expect(game.shared().players[0].queue).toEqual([[1, 30, 2]]);
        // And one after it never goes before it
        game.receive("alice", { turn: "left", n: 2, tick: 25 });
        expect(game.shared().players[0].queue).toEqual([
            [1, 30, 2],
            [2, 30, 3],
        ]);
    });

    it("takes each turn once, and refuses one that won't do, counting it as had", () => {
        const { game, at } = started();
        at(20);
        game.receive("alice", { turn: "up", n: 1, tick: 18 });
        // Sent again after a reconnect
        expect(game.receive("alice", { turn: "up", n: 1, tick: 18 })).toEqual({ ok: true, changed: false });
        expect(game.receive("alice", { turn: "sideways", n: 2, tick: 18 })).toEqual({
            ok: false,
            error: "A turn is a way, its number and its tick",
            changed: false,
        });
        expect(game.receive("alice", { turn: "up", n: 2, tick: 20 + AHEAD_TICKS + 1 })).toEqual({
            ok: false,
            error: "That turn is ahead of the game",
            changed: true,
        });
        expect(game.shared().players[0]).toMatchObject({ ack: 2, queue: [[1, 18, 0]] });
        expect(game.receive("carol", { turn: "up", n: 1, tick: 20 })).toMatchObject({
            error: "You aren't in this game",
        });
    });

    it("holds only so many turns it hasn't reached", () => {
        const { game, at } = started();
        at(20);
        for (let n = 1; n <= MAX_QUEUE; n++) {
            expect(game.receive("alice", { turn: n % 2 ? "up" : "down", n, tick: 20 + n })).toMatchObject({ ok: true });
        }
        expect(game.receive("alice", { turn: "up", n: MAX_QUEUE + 1, tick: 55 })).toMatchObject({
            error: "Too many turns at once",
        });
    });

    it("refuses turns from a player who's out of lives", () => {
        const { game, at } = started({ lives: 1 });
        // Nobody turning, ChatMan sits in a corner until he's caught
        for (let tick = 0; !game.board("alice")!.out; tick += 20) at(tick), game.tick();
        expect(game.receive("alice", { turn: "up", n: 1, tick: 0 })).toMatchObject({
            error: "You're out of lives",
        });
    });

    it("ends when everyone's out of lives, the top score winning", () => {
        const { game, at } = started({ lives: 1 });
        // Bob heads up and on, which scores differently from Alice's corner
        game.receive("bob", { turn: "up", n: 1, tick: 0 });
        let tick = 0;
        while (game.phase === "active" && tick < 10_000) {
            tick += 20;
            at(tick);
            game.endIfTimeUp();
        }
        expect(game.phase).toBe("finished");
        expect(game.data.ended).toBe("out");
        const [top] = game.ranked();
        const score = game.board(top.id)!.score;
        expect(score).toBeGreaterThanOrEqual(game.board(top.id === "alice" ? "bob" : "alice")!.score);
        expect(game.data.winner).toBe(top.id);
        expect(game.result()).toBe(`@UserId(${top.id}) won with ${score.toLocaleString("en-US")} points`);
        expect(game.endState()?.phase).toBe("finished");
    });

    it("ends once the time's up and the last turns have had time to arrive", () => {
        const { game, clock } = started({ minutes: 1 });
        // Lives to spare, so nobody's out before the time's up
        for (const id of ["alice", "bob"]) game.board(id)!.lives = 99;
        clock.now = game.data.endsAt! + LAG_TICKS * TICK_MS - 1;
        expect(game.endIfTimeUp()).toBe(false);
        clock.now++;
        expect(game.endIfTimeUp()).toBe(true);
        expect(game.data).toMatchObject({ ended: "time", finishedAt: game.data.endsAt });
        expect(game.board("alice")!.t).toBe(game.lastTick);
        // Level, so the first to join wins
        expect(game.result()).toMatch(/^Time's up! @UserId\(alice\) won with [\d,]+ points$/);
        expect(game.endIfTimeUp()).toBe(false);
    });

    it("says what one player scored, rather than that they won", () => {
        const clock = { now: 0 };
        const game = ChatManRace.create({ now: () => clock.now });
        game.join("alice", "Alice");
        game.start();
        clock.now = game.data.endsAt! + MINUTE;
        game.endIfTimeUp();
        expect(game.result()).toMatch(/^Time's up! @UserId\(alice\) scored [\d,]+ points$/);
    });

    it("doesn't run the clock while the bot was down", () => {
        const { game, at } = started();
        at(100);
        game.tick();
        const before = game.data.playsAt!;
        expect(game.resume(5000)).toBe(true);
        expect(game.data.playsAt).toBe(before + 5000);
        game.tick();
        expect(game.board("alice")!.t).toBe(90);
    });

    it("carries on the same from what the store wrote", () => {
        const { game, clock, at } = started();
        at(30);
        game.receive("alice", { turn: "up", n: 1, tick: 25 });
        const copy = new ChatManRace(JSON.parse(JSON.stringify(game.toJson())) as ChatManData, {
            now: () => clock.now,
        });
        at(200);
        game.tick();
        copy.tick();
        expect(copy.board("alice")).toEqual(game.board("alice"));
        expect(copy.shared()).toEqual(game.shared());
    });

    it("lets only the host change the settings, before the start", () => {
        const { game } = seated();
        expect(game.configure("bob", { lives: 5 })).toEqual({
            ok: false,
            error: "Only the host can change the settings",
        });
        expect(game.configure("alice", { lives: 5 })).toEqual({ ok: true });
        expect(game.settings()).toEqual({ minutes: 3, lives: 5 });
    });
});
