// Backgammon as a duel: the bot's rolls, which the state carries, the turn played with them, and a
// roll with no move, which the bot plays for the player
import { describe, expect, it } from "vitest";
import { Duel } from "../duel/duel";
import { Backgammon } from "./board";
import { BACKGAMMON, MINUTES } from "./rules";

const MINUTE = 60_000;

/** A random that gives these, then 0.5s: a die is 1 + floor(6r), so 0 is a 1, 0.9 a 6 */
function sequence(values: number[]): () => number {
    let i = 0;
    return () => values[i++] ?? 0.5;
}

/** A die's random, for `sequence` */
const die = (n: number) => (n - 0.5) / 6;

function started(rules = BACKGAMMON, rolls: number[] = []) {
    const clock = { now: 1_000_000 };
    // Alice first, then the rolls
    const game = Duel.create(rules, {
        now: () => clock.now,
        random: sequence([0.9, ...rolls.map(die)]),
    });
    game.join("alice", "Alice");
    game.join("bob", "Bob");
    game.start();
    expect(game.playerAt(0)).toBe("alice");
    return { game, clock };
}

describe("backgammon as a duel", () => {
    it("rolls for each turn, never a double first, and takes the turn played with the roll", () => {
        // The first roll's double is rolled again
        const { game, clock } = started(BACKGAMMON, [4, 4, 3, 1, 6, 5]);
        expect(game.shared().roll).toBe("31");
        expect(game.play("bob", "31:8/5,6/5")).toEqual({ ok: false, error: "It's not your turn" });
        expect(game.play("alice", "42:8/4,6/4")).toEqual({
            ok: false,
            error: "Those aren't your dice",
        });
        expect(game.play("alice", "31:8/5")).toEqual({
            ok: false,
            error: "Your dice have 2 moves to make",
        });
        clock.now += 3000;
        const played = game.play("alice", "31:8/5,6/5");
        expect(played.ok).toBe(true);
        expect(game.shared().moves).toEqual(["31:8/5,6/5"]);
        expect(game.shared().roll).toBe("65");
        expect(game.waitingFor()).toEqual(["bob"]);
        expect(game.play("bob", "65:24/13")).toEqual({
            ok: false,
            error: "You can't move 24/13",
        });
        expect(game.play("bob", "65:24/18,18/13").ok).toBe(true);
        // A game read back from the store has the roll to come
        const read = new Duel(BACKGAMMON, JSON.parse(JSON.stringify(game.toJson())));
        expect(read.shared().roll).toBe(game.shared().roll);
        expect(read.position.dice).toEqual(game.position.dice);
    });

    it("plays a roll with no move for the player, taking none of their time", () => {
        // Alice is on the bar against Bob's closed board
        const blocked = {
            ...BACKGAMMON,
            start: () =>
                Backgammon.from({ bar: 1, 13: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 }),
        };
        const { game } = started(blocked, [3, 1, 2, 1]);
        expect(game.shared().moves).toEqual(["31:"]);
        expect(game.shared().roll).toBe("21");
        expect(game.waitingFor()).toEqual(["bob"]);
        expect(game.timeLeft(0)).toBe(MINUTES * MINUTE);
    });

    it("ends with a win, saying if it's a gammon, and with no roll to come", () => {
        const almost = {
            ...BACKGAMMON,
            start: () => Backgammon.from({ 1: 1 }, { 6: 15 }),
        };
        const { game } = started(almost, [2, 1]);
        expect(game.play("alice", "21:1/off").ok).toBe(true);
        expect(game.phase).toBe("finished");
        expect(game.shared().roll).toBeUndefined();
        expect(game.result()).toBe("@UserId(alice) won with a gammon");
    });
});
