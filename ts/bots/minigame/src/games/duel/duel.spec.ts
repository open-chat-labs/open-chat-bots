// A duel's seats, start, turns, clocks and endings, through Four in a Row, the first duel
import { describe, expect, it } from "vitest";
import { FIRST_MOVE_MS } from "../game";
import { FOUR_IN_A_ROW, MINUTES } from "../fourinarow/rules";
import { Duel, type DuelData } from "./duel";
import { FIRST_IS_HOST, FIRST_IS_OPPONENT } from "./settings";

const MINUTE = 60_000;

/** A game with alice, then bob, seated, whose clock is `clock.now` */
function seated(options: { random?: number; first?: number; host?: string } = {}) {
    const clock = { now: 1_000_000 };
    const game = Duel.create(FOUR_IN_A_ROW, {
        now: () => clock.now,
        random: () => options.random ?? 0.9,
        settings: options.first === undefined ? undefined : { first: options.first },
        host: options.host === undefined ? undefined : { id: options.host, name: "Host" },
    });
    expect(game.join("alice", "Alice")).toBeUndefined();
    expect(game.join("bob", "Bob")).toBeUndefined();
    return { game, clock };
}

/** Started with alice to move first */
function started() {
    const s = seated();
    s.game.start();
    expect(s.game.playerAt(0)).toBe("alice");
    return s;
}

/** Started, once each player has made their first move, which their clocks don't run for */
function opened() {
    const s = started();
    expect(s.game.play("alice", 3).ok).toBe(true);
    expect(s.game.play("bob", 3).ok).toBe(true);
    return s;
}

describe("a duel", () => {
    it("seats two, refuses a third, and frees a seat left before the start", () => {
        const { game } = seated();
        expect(game.join("carol", "Carol")).toBe("This game is for two");
        expect(game.join("alice", "Alice")).toBeUndefined();
        expect(game.isSeated("alice")).toBe(true);
        expect(game.isPlayer("alice")).toBe(false);
        expect(game.leave("bob")).toBe(true);
        expect(game.cannotStart()).toBe("Four in a Row needs two players");
        expect(game.start()).toEqual(["alice"]);
        expect(game.phase).toBe("open");
    });

    it("puts the host first, or their opponent, as set, and otherwise picks at random", () => {
        const host = seated({ first: FIRST_IS_HOST, host: "bob" });
        expect(host.game.start()).toEqual(["bob", "alice"]);
        const opponent = seated({ first: FIRST_IS_OPPONENT, host: "alice" });
        expect(opponent.game.start()).toEqual(["bob", "alice"]);
        // A host who isn't playing can't go first: it's random
        const away = seated({ first: FIRST_IS_HOST, host: "carol", random: 0.9 });
        expect(away.game.start()).toEqual(["alice", "bob"]);
        expect(seated({ random: 0.1 }).game.start()).toEqual(["bob", "alice"]);
    });

    it("takes turns, each player's clock running on their turns after their first move", () => {
        const { game, clock } = started();
        expect(game.phase).toBe("active");
        expect(game.waitingFor()).toEqual(["alice"]);
        expect(game.play("bob", 3)).toEqual({ ok: false, error: "It's not your turn" });
        expect(game.play("carol", 3)).toEqual({ ok: false, error: "You're not playing" });
        expect(game.play("alice", "3")).toEqual({ ok: false, error: "That isn't a move" });
        expect(game.play("alice", 9)).toEqual({ ok: false, error: "That isn't a move" });

        clock.now += 5000;
        const played = game.play("alice", 3);
        expect(played.ok).toBe(true);
        expect(game.waitingFor()).toEqual(["bob"]);
        // Neither clock ran for alice's first move, and neither runs for bob's, though bob has a
        // minute to make it
        clock.now += 2000;
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE);
        expect(game.timeLeft(1)).toBe(MINUTES * MINUTE);
        expect(game.deadline()).toBe(clock.now - 2000 + FIRST_MOVE_MS);
        expect(game.firstMoveLeft()).toBe(FIRST_MOVE_MS - 2000);
        expect(game.shared().clock).toEqual({
            at: clock.now,
            ms: [MINUTES * MINUTE, MINUTES * MINUTE],
            running: null,
            firstMoveMs: FIRST_MOVE_MS - 2000,
        });
        expect(game.play("bob", 3).ok).toBe(true);

        // From here on, the side to move's clock runs
        clock.now += 4000;
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE - 4000);
        expect(game.deadline()).toBe(clock.now - 4000 + MINUTES * MINUTE);
        expect(game.play("alice", 4).ok).toBe(true);
        clock.now += 3000;
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE - 4000);
        expect(game.timeLeft(1)).toBe(MINUTES * MINUTE - 3000);
        expect(game.deadline()).toBe(clock.now - 3000 + MINUTES * MINUTE);
        expect(game.shared()).toMatchObject({
            version: 1,
            game: "four-in-a-row",
            phase: "active",
            players: ["alice", "bob"],
            names: { alice: "Alice", bob: "Bob" },
            settings: { first: 0, minutes: MINUTES },
            moves: [3, 3, 4],
            clock: {
                at: clock.now,
                ms: [MINUTES * MINUTE - 4000, MINUTES * MINUTE - 3000],
                running: 1,
            },
        });
    });

    it("ends when the board says, naming the winner by user id on the card", () => {
        const { game, clock } = started();
        for (const [who, column] of [
            ["alice", 0],
            ["bob", 0],
            ["alice", 1],
            ["bob", 1],
            ["alice", 2],
            ["bob", 2],
        ] as const) {
            expect(game.play(who, column).ok).toBe(true);
        }
        clock.now += 1000;
        expect(game.play("alice", 3).ok).toBe(true);
        expect(game.phase).toBe("finished");
        expect(game.ending).toEqual({ kind: "board", winner: 0 });
        expect(game.finishedAt).toBe(clock.now);
        expect(game.waitingFor()).toEqual([]);
        expect(game.result()).toBe("@UserId(alice) won with four in a row");
        expect(game.play("bob", 4)).toEqual({ ok: false, error: "The game has finished" });
        // The end state is the final state, every move with it, and the clocks stopped
        const end = game.endState()!;
        expect(end.moves).toEqual([0, 0, 1, 1, 2, 2, 3]);
        expect(end.clock?.running).toBeNull();
        clock.now += 60_000;
        expect(game.timeLeft(0)).toBe(end.clock!.ms[0]);
    });

    it("loses on time, to the side to move", () => {
        const { game, clock } = opened();
        game.play("alice", 4);
        clock.now += MINUTES * MINUTE - 1;
        expect(game.endIfTimeUp()).toBe(false);
        clock.now += 1;
        expect(game.endIfTimeUp()).toBe(true);
        expect(game.ending).toEqual({ kind: "timeout", winner: 0 });
        expect(game.result()).toBe("@UserId(alice) won on time");
        expect(game.timeLeft(1)).toBe(0);
        expect(game.endIfTimeUp()).toBe(false);
        // A move after the flag fell is refused, as the flag comes first
        const late = opened();
        late.clock.now += MINUTES * MINUTE;
        expect(late.game.play("alice", 4)).toEqual({ ok: false, error: "The game has finished" });
        expect(late.game.ending).toEqual({ kind: "timeout", winner: 1 });
    });

    it("is called off, with no winner, if a first move isn't made within a minute", () => {
        const { game, clock } = started();
        clock.now += FIRST_MOVE_MS - 1;
        expect(game.endIfTimeUp()).toBe(false);
        expect(game.play("alice", 3).ok).toBe(true);
        // bob's minute starts from alice's move
        clock.now += FIRST_MOVE_MS - 1;
        expect(game.endIfTimeUp()).toBe(false);
        clock.now += 1;
        expect(game.endIfTimeUp()).toBe(true);
        expect(game.ending).toEqual({ kind: "aborted", seat: 1 });
        expect(game.result()).toBe("Called off: @UserId(bob) didn't make a first move");
        expect(game.finishedAt).toBe(clock.now);
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE);
        expect(game.timeLeft(1)).toBe(MINUTES * MINUTE);
        expect(game.firstMoveLeft()).toBeUndefined();
        expect(game.endState()?.clock).toEqual({
            at: clock.now,
            ms: [MINUTES * MINUTE, MINUTES * MINUTE],
            running: null,
        });
        // A first move after the minute's up is refused, as the call-off comes first
        const late = started();
        late.clock.now += FIRST_MOVE_MS;
        expect(late.game.play("alice", 3)).toEqual({ ok: false, error: "The game has finished" });
        expect(late.game.ending).toEqual({ kind: "aborted", seat: 0 });
    });

    it("ends on a resignation, whoever's turn it is, or when a player leaves", () => {
        const resigned = started();
        expect(resigned.game.resign("bob").ok).toBe(true);
        expect(resigned.game.result()).toBe("@UserId(bob) resigned");
        const left = started();
        expect(left.game.leave("carol")).toBe(false);
        expect(left.game.leave("alice")).toBe(true);
        expect(left.game.ending).toEqual({ kind: "abandonment", winner: 1 });
        expect(left.game.result()).toBe("@UserId(alice) left the game");
    });

    it("doesn't charge the side to move for the time the bot was down", () => {
        const { game, clock } = opened();
        clock.now += 10_000;
        expect(game.resume(60_000)).toBe(true);
        clock.now += 60_000;
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE - 10_000);
        expect(seated().game.resume(1000)).toBe(false);
        // Nor for the time a first move has
        const first = started();
        first.clock.now += 10_000;
        expect(first.game.resume(FIRST_MOVE_MS)).toBe(true);
        first.clock.now += FIRST_MOVE_MS;
        expect(first.game.firstMoveLeft()).toBe(FIRST_MOVE_MS - 10_000);
        expect(first.game.endIfTimeUp()).toBe(false);
    });

    it("lets only the host change the settings, and only before the start", () => {
        const { game } = seated({ host: "alice" });
        expect(game.configure("bob", { minutes: 5 })).toEqual({
            ok: false,
            error: "Only the host can change the settings",
        });
        expect(game.configure("alice", { minutes: 5 })).toEqual({ ok: true });
        expect(game.settings()).toEqual({ first: 0, minutes: 5 });
        game.start();
        expect(game.timeLeft(0)).toBe(5 * MINUTE);
        expect(game.configure("alice", { minutes: 1 })).toEqual({
            ok: false,
            error: "The game has started",
        });
    });

    it("comes back from the store as it was, its board replayed from the moves", () => {
        const { game, clock } = started();
        game.play("alice", 3);
        game.play("bob", 3);
        const data = JSON.parse(JSON.stringify(game.toJson())) as DuelData<number>;
        const copy = new Duel(FOUR_IN_A_ROW, data, { now: () => clock.now });
        expect(copy.shared()).toEqual(game.shared());
        expect(copy.position.at(3, 1)).toBe(1);
        expect(copy.waitingFor()).toEqual(["alice"]);
        // A move list that can't be replayed is refused, so the store skips the game
        expect(() => new Duel(FOUR_IN_A_ROW, { ...data, moves: [0, 0, 0, 0, 0, 0, 0] })).toThrow(
            "Move 7, 0: That column's full",
        );
    });
});
