// Backgammon's board: the start, moving and hitting, the bar, bearing off, the rules on how much
// of the dice to use, and the win's kind, with every turn the board allows checked against a
// brute-force search of its own
import { describe, expect, it } from "vitest";
import { replay } from "../duel/types";
import { BAR, Backgammon, OFF, parseMove, rollDice, type CheckerSpec, type Dice } from "./board";
import { BACKGAMMON } from "./rules";

/** The seat's checkers as a spec for `Backgammon.from` */
function specOf(board: Backgammon, seat: 0 | 1): CheckerSpec {
    const spec: CheckerSpec = {};
    board.checkers(seat).forEach((n, point) => {
        if (n > 0 && point !== OFF) spec[point === BAR ? "bar" : point] = n;
    });
    return spec;
}

/** A copy of the board, the side to move's dice as given */
function copy(board: Backgammon, dice: string): Backgammon {
    const seat = board.turn;
    const other = seat === 0 ? 1 : 0;
    const copied = Backgammon.from(specOf(board, seat), specOf(board, other), seat);
    copied.rolled(dice);
    return copied;
}

function key(board: Backgammon): string {
    return `${board.checkers(0).join()}|${board.checkers(1).join()}`;
}

// The search the tests check the board against: every order of the dice, every checker, the most
// dice that can be used, and the higher of two if only one can be
function bruteForce(board: Backgammon, dice: Dice): Set<string> {
    const seat = board.turn;
    const start: [number[], number[]] = [
        board.checkers(seat).slice(),
        board.checkers(seat === 0 ? 1 : 0).slice(),
    ];
    const ends: { me: number[]; them: number[]; used: number[] }[] = [];
    const go = (me: number[], them: number[], left: number[], used: number[]) => {
        ends.push({ me, them, used });
        for (let i = 0; i < left.length; i++) {
            const die = left[i];
            const rest = [...left.slice(0, i), ...left.slice(i + 1)];
            for (let from = 1; from <= 25; from++) {
                if (me[from] === 0 || (me[25] > 0 && from !== 25)) continue;
                let to = from - die;
                if (to >= 1) {
                    if (them[25 - to] >= 2) continue;
                } else {
                    const home = me.slice(7).every((n) => n === 0);
                    const furthest = me.slice(from + 1, 7).every((n) => n === 0);
                    if (!home || (to < 0 && !furthest)) continue;
                    to = 0;
                }
                const m = me.slice();
                const t = them.slice();
                m[from]--;
                m[to]++;
                if (to > 0 && t[25 - to] === 1) {
                    t[25 - to] = 0;
                    t[25]++;
                }
                go(m, t, rest, [...used, die]);
            }
        }
    };
    go(
        start[0],
        start[1],
        dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice],
        [],
    );
    const most = ends.reduce((m, e) => Math.max(m, e.used.length), 0);
    let best = ends.filter((e) => e.used.length === most);
    if (most === 1 && dice[0] !== dice[1] && best.some((e) => e.used[0] === dice[0])) {
        best = best.filter((e) => e.used[0] === dice[0]);
    }
    return new Set(
        best.map((e) =>
            seat === 0 ? `${e.me.join()}|${e.them.join()}` : `${e.them.join()}|${e.me.join()}`,
        ),
    );
}

/** A seeded random, so a failure can be played again */
function seeded(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
}

describe("backgammon's board", () => {
    it("starts with 15 checkers each, 167 pips away", () => {
        const board = new Backgammon();
        for (const seat of [0, 1] as const) {
            expect(board.checkers(seat).reduce((a, b) => a + b, 0)).toBe(15);
            expect(board.pips(seat)).toBe(167);
        }
        expect(board.turn).toBe(0);
    });

    it("plays a turn with the dice rolled, a die at a time", () => {
        const board = new Backgammon();
        board.rolled("31");
        expect(board.play("42:8/4,6/4")).toBe("Those aren't your dice");
        expect(board.play("31:8/5")).toBe("Your dice have 2 moves to make");
        expect(board.play("31:8/4,6/5")).toBe("You can't move 8/4");
        expect(board.play("31:8/5,6/5")).toBeUndefined();
        expect(board.checkers(0)[5]).toBe(2);
        expect(board.turn).toBe(1);
        expect(board.last).toMatchObject({ seat: 0, dice: [3, 1], hits: [] });
        expect(board.pips(0)).toBe(163);
        // Replayed without a roll, the move's own dice are the roll
        const replayed = replay(BACKGAMMON, ["31:8/5,6/5"], {});
        expect(key(replayed)).toBe(key(board));
    });

    it("hits a blot, which has to come back in from the bar before anything else moves", () => {
        // Seat 0 has a blot on its 5 point, which is seat 1's 20 point
        const board = Backgammon.from(
            { 24: 2, 13: 5, 8: 3, 6: 5 },
            { 6: 5, 5: 1, 8: 3, 13: 5, 24: 1 },
            1,
        );
        board.rolled("41");
        expect(board.play("41:24/20,6/5")).toBeUndefined();
        expect(board.last?.hits).toEqual([20]);
        expect(board.checkers(0)[BAR]).toBe(1);
        board.rolled("63");
        expect(board.play("63:13/7,8/5")).toBe("You can't move 13/7");
        // 25 - 6 is the other's 6 point, which they hold: only the 3 comes in
        expect(board.play("63:bar/22,13/7")).toBeUndefined();
    });

    it("gives no move when every way in from the bar is blocked", () => {
        const board = Backgammon.from(
            { bar: 1, 13: 14 },
            { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 },
        );
        board.rolled("66");
        expect(board.noMove()).toBe("66:");
        expect(board.play("66:")).toBeUndefined();
        expect(board.turn).toBe(1);
    });

    it("bears off with the exact die, or a higher one from the furthest point in", () => {
        const board = Backgammon.from({ 5: 1, 3: 2 }, { 13: 15 });
        board.rolled("64");
        // The 6 takes the 5 point's checker off, the furthest; the 4 can't take a 3 off while
        // the 5's still on
        expect(board.play("64:3/off,5/off")).toBe("You can't move 3/off");
        expect(board.play("64:5/off,3/off")).toBeUndefined();
        expect(board.checkers(0)[OFF]).toBe(14);
        // Not while a checker's outside the home board
        const outside = Backgammon.from({ 7: 1, 2: 2 }, { 13: 15 });
        outside.rolled("21");
        expect(outside.play("21:2/off,7/6")).toBe("You can't move 2/off");
    });

    it("plays the higher die when only one of the two can be played", () => {
        // From the 9 point, a 6 or a 2 alone can be played, but not both, as either way the
        // other die lands on the 1 point, which is held
        const board = Backgammon.from({ 9: 1 }, { 24: 2 }, 0);
        board.rolled("62");
        const turn = board.turnWith([6, 2]);
        expect(turn.length).toBe(1);
        expect(turn.options()).toEqual([{ from: 9, to: 3, die: 6 }]);
        expect(board.play("62:9/7")).toBe("You can't move 9/7");
        expect(board.play("62:9/3")).toBeUndefined();
    });

    it("plays a double four times", () => {
        const board = new Backgammon();
        board.rolled("66");
        expect(board.play("66:24/18,24/18,13/7,13/7")).toBeUndefined();
        expect(board.pips(0)).toBe(167 - 24);
    });

    it("says the win's kind: a single game, a gammon or a backgammon", () => {
        const single = Backgammon.from({ 1: 1 }, { 6: 3 });
        single.rolled("21");
        expect(single.play("21:1/off")).toBeUndefined();
        expect(single.outcome).toEqual({ winner: 0, kind: 1 });

        const gammon = Backgammon.from({ 1: 1 }, { 6: 15 });
        gammon.rolled("21");
        expect(gammon.play("21:1/off")).toBeUndefined();
        expect(gammon.outcome).toEqual({ winner: 0, kind: 2 });

        // A checker in the winner's home board, the loser's 19 to 24 points
        const backgammon = Backgammon.from({ 1: 1 }, { 6: 14, 20: 1 });
        backgammon.rolled("21");
        expect(backgammon.play("21:1/off")).toBeUndefined();
        expect(backgammon.outcome).toEqual({ winner: 0, kind: 3 });
        expect(backgammon.play("21:")).toBe("The game has finished");
    });

    it("refuses what isn't a move", () => {
        expect(parseMove("31:8/5,6/5")).toEqual({
            dice: [3, 1],
            steps: [
                { from: 8, to: 5 },
                { from: 6, to: 5 },
            ],
        });
        for (const bad of [
            "13:8/5,6/5",
            "31:5/8",
            "31:25/22",
            "31:8/0",
            "70:",
            "31:8/5,6/5,",
            "31",
        ]) {
            expect(parseMove(bad), bad).toBeUndefined();
        }
    });

    it("never rolls a double first", () => {
        const random = seeded(7);
        for (let i = 0; i < 200; i++) {
            const roll = rollDice(random, true);
            expect(roll[0]).not.toBe(roll[1]);
            expect(Number(roll[0])).toBeGreaterThan(Number(roll[1]));
        }
    });

    it("allows the same turns as a brute-force search, through whole random games", () => {
        for (let seed = 1; seed <= 12; seed++) {
            const random = seeded(seed);
            const moves: string[] = [];
            let board = new Backgammon();
            let first = true;
            while (board.outcome === undefined) {
                const roll = rollDice(random, first);
                first = false;
                board.rolled(roll);
                const dice = board.dice!;
                const legal = board.legalMoves();
                const results = new Set(
                    legal.map((move) => {
                        const after = copy(board, roll);
                        expect(after.play(move), move).toBeUndefined();
                        return key(after);
                    }),
                );
                expect(results, `seed ${seed}, move ${moves.length + 1}, ${roll}`).toEqual(
                    bruteForce(board, dice),
                );
                const none = board.noMove();
                const move = none ?? legal[Math.floor(random() * legal.length)];
                if (none !== undefined) expect(legal).toEqual([none]);
                expect(board.play(move)).toBeUndefined();
                moves.push(move);
                expect(moves.length).toBeLessThan(1000);
            }
            // The game replays from its moves alone
            board = replay(BACKGAMMON, moves, {});
            expect(board.outcome).toBeDefined();
        }
    }, 60_000);
});
