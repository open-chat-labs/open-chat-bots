import { describe, expect, it } from "vitest";
import { duration } from "../race2048/race";
import { mineCells, neighbours } from "./field";
import { MinesweeperRace, type MinesData } from "./race";
import { BOOM, FLAG, HIDDEN, MAX_ACTS, MAX_PLAYERS, PENALTY_MS, type Act } from "./types";

const MINUTE = 60_000;

/** A race with alice and bob seated, on a clock the test moves */
function seated() {
    const clock = { now: 1_000_000 };
    const race = MinesweeperRace.create({ now: () => clock.now, random: () => 0.25 });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    return { race, clock };
}

function started() {
    const s = seated();
    s.race.start();
    return s;
}

function act(race: MinesweeperRace, userId: string, ...acts: Act[]) {
    return race.act(userId, { acts });
}

function view(race: MinesweeperRace, userId: string): string {
    return race.own(userId)!.view;
}

/** A hidden cell that's safe, and whether it touches a mine */
function safeHidden(race: MinesweeperRace, userId: string, touching: boolean): number {
    const field = race.field!;
    const cells = view(race, userId);
    const cell = [...cells].findIndex(
        (c, i) => c === HIDDEN && field.mine[i] === 0 && field.count[i] > 0 === touching,
    );
    expect(cell).toBeGreaterThanOrEqual(0);
    return cell;
}

/** Opens every safe cell, a request's worth at a time */
function clearAll(race: MinesweeperRace, userId: string) {
    const field = race.field!;
    const safe = [...field.mine.keys()].filter((i) => field.mine[i] === 0);
    for (let i = 0; i < safe.length; i += MAX_ACTS) {
        race.act(userId, { acts: safe.slice(i, i + MAX_ACTS).map((reveal) => ({ reveal })) });
    }
}

describe("a Minesweeper race", () => {
    it("seats up to ten, and frees a seat left before the start", () => {
        const race = MinesweeperRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(race.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(race.join("late", "Late")).toBe("All 10 places are taken");
        expect(race.leave("p3")).toBe(true);
        expect(race.isSeated("p3")).toBe(false);
        expect(MinesweeperRace.create().cannotStart()).toBe("Nobody has joined yet");
    });

    it("deals everyone the same board, with the start open, and keeps the mines to itself", () => {
        const { race, clock } = seated();
        expect(race.start()).toEqual(["alice", "bob"]);
        const field = race.field!;
        expect(mineCells(field)).toHaveLength(22);
        const shared = race.shared();
        expect(shared).toMatchObject({
            phase: "active",
            size: 12,
            mines: 22,
            startedAt: clock.now,
            endsAt: clock.now + 3 * MINUTE,
            seats: [],
            names: { alice: "Alice", bob: "Bob" },
        });
        // Nothing in the state says where it's safe
        expect(shared.mineCells).toBeUndefined();
        expect(shared.racers.every((r) => r.view === undefined)).toBe(true);
        const alice = race.own("alice")!;
        expect(alice.view).toBe(race.own("bob")!.view);
        expect(alice.view[field.start]).toBe("0");
        expect(alice.cleared).toBe([...alice.view].filter((c) => /\d/.test(c)).length);
        expect(alice.cleared).toBeGreaterThanOrEqual(9);
        expect(shared.racers[0]).toEqual({ id: "alice", cleared: alice.cleared, hits: 0, rev: 0 });
        expect(race.join("carol", "Carol")).toBe("The race has started");
        expect(race.own("carol")).toBeUndefined();
    });

    it("gives each racer their own board in their private part of the state, while it's on", () => {
        const { race } = seated();
        expect(race.privateState()).toBeUndefined();
        race.start();
        act(race, "alice", { reveal: safeHidden(race, "alice", true) });
        expect(race.privateState()).toEqual({ alice: race.own("alice"), bob: race.own("bob") });
        clearAll(race, "bob");
        // Once it's over, every board is shared
        expect(race.privateState()).toBeUndefined();
    });

    it("opens a cell, and every cell round one that touches no mine", () => {
        const { race } = started();
        const field = race.field!;
        const cell = safeHidden(race, "alice", true);
        const before = race.own("alice")!;
        const opened = act(race, "alice", { reveal: cell });
        expect(opened).toMatchObject({ changed: true, result: { ok: true } });
        const own = race.own("alice")!;
        expect(own.view[cell]).toBe(String(field.count[cell]));
        expect(own.cleared).toBe(before.cleared + 1);
        expect(own.rev).toBe(1);
        // Bob's board is his own
        expect(view(race, "bob")[cell]).toBe(HIDDEN);
        // Opening it again does nothing
        expect(act(race, "alice", { reveal: cell }).changed).toBe(false);

        const zero = safeHidden(race, "alice", false);
        act(race, "alice", { reveal: zero });
        const after = view(race, "alice");
        for (const n of neighbours(field.size, zero)) expect(after[n]).toMatch(/\d/);
    });

    it("flags a cell, and won't open it until the flag's off", () => {
        const { race } = started();
        const cell = safeHidden(race, "alice", true);
        expect(act(race, "alice", { flag: cell, on: true }).changed).toBe(true);
        expect(view(race, "alice")[cell]).toBe(FLAG);
        // Sent again, eg. after a reconnect: nothing more
        expect(act(race, "alice", { flag: cell, on: true }).changed).toBe(false);
        expect(act(race, "alice", { reveal: cell }).changed).toBe(false);
        act(race, "alice", { flag: cell, on: false });
        expect(view(race, "alice")[cell]).toBe(HIDDEN);
        // An open cell takes no flag
        const start = race.field!.start;
        expect(act(race, "alice", { flag: start, on: true }).changed).toBe(false);
    });

    it("stops a racer who sets off a mine for a while, then lets them go on", () => {
        const { race, clock } = started();
        const [mine] = mineCells(race.field!);
        const safe = safeHidden(race, "alice", true);
        const blown = act(race, "alice", { reveal: mine }, { reveal: safe });
        expect(blown.changed).toBe(true);
        expect(blown.result).toEqual({
            ok: false,
            error: "You set off a mine: wait 10s",
            own: expect.objectContaining({ hits: 1, frozenMs: PENALTY_MS }),
        });
        const own = race.own("alice")!;
        expect(own.view[mine]).toBe(BOOM);
        expect(own.view[safe]).toBe(HIDDEN);
        expect(race.shared().racers[0]).toMatchObject({ hits: 1 });

        clock.now += PENALTY_MS - 1500;
        expect(act(race, "alice", { flag: safe, on: true }).result).toMatchObject({
            ok: false,
            error: "You set off a mine: wait 2s",
        });
        clock.now += 1500;
        expect(act(race, "alice", { reveal: safe }).result).toMatchObject({ ok: true });
        expect(race.own("alice")!.frozenMs).toBe(0);
    });

    it("opens round a number with as many flags round it as it says", () => {
        const { race } = started();
        const field = race.field!;
        const cells = view(race, "alice");
        // An open number with a hidden neighbour that's safe
        const number = [...cells].findIndex(
            (c, i) =>
                Number(c) > 0 &&
                neighbours(field.size, i).some((n) => cells[n] === HIDDEN && field.mine[n] === 0),
        );
        const around = neighbours(field.size, number);
        const mines = around.filter((n) => field.mine[n] === 1);
        // Too few flags: nothing
        expect(act(race, "alice", { chord: number }).changed).toBe(false);
        act(race, "alice", ...mines.map((flag) => ({ flag, on: true })));
        expect(act(race, "alice", { chord: number }).changed).toBe(true);
        const after = view(race, "alice");
        for (const n of around) expect(after[n]).toMatch(field.mine[n] === 1 ? FLAG : /\d/);

        // Flags in the wrong place set off the mines they leave
        const b = view(race, "bob");
        const safe = around.filter((n) => field.mine[n] === 0 && b[n] === HIDDEN);
        expect(safe.length).toBeGreaterThanOrEqual(mines.length);
        act(race, "bob", ...safe.slice(0, mines.length).map((flag) => ({ flag, on: true })));
        expect(act(race, "bob", { chord: number }).result).toMatchObject({ ok: true });
        expect(race.own("bob")!.hits).toBe(mines.length);
        for (const mine of mines) expect(view(race, "bob")[mine]).toBe(BOOM);
    });

    it("ends when someone clears the field, and shows everyone's board then", () => {
        const { race, clock } = started();
        clock.now += 75_000;
        clearAll(race, "bob");
        expect(race.phase).toBe("finished");
        const shared = race.shared();
        expect(shared).toMatchObject({ ended: "cleared", winner: "bob", finishedAt: clock.now });
        expect(shared.mineCells).toEqual(mineCells(race.field!));
        expect(shared.racers.map((r) => r.view)).toEqual([view(race, "alice"), view(race, "bob")]);
        expect(race.result()).toBe(`@UserId(bob) cleared the field in ${duration(75_000)}`);
        expect(race.endState()).toEqual(shared);
        expect(act(race, "alice", { reveal: 0 }).result).toMatchObject({
            ok: false,
            error: "The race is over",
        });
    });

    it("gives the race to whoever's opened the most when the time's up", () => {
        const { race, clock } = started();
        act(race, "alice", { reveal: safeHidden(race, "alice", true) });
        clock.now += 1000;
        act(race, "bob", { reveal: safeHidden(race, "bob", true) });
        expect(race.endIfTimeUp()).toBe(false);
        clock.now += 3 * MINUTE;
        expect(race.endIfTimeUp()).toBe(true);
        // Level on cells, and on mines: alice got there first
        expect(race.shared()).toMatchObject({ ended: "time", winner: "alice" });
        expect(race.result()).toBe("Time's up! @UserId(alice) cleared the most");
    });

    it("counts a mine against a racer level on cells when the time's up", () => {
        const { race, clock } = started();
        const [mine] = mineCells(race.field!);
        act(race, "alice", { reveal: mine });
        clock.now += 3 * MINUTE;
        race.endIfTimeUp();
        expect(race.shared().winner).toBe("bob");
    });

    it("doesn't run the clocks while the bot's down", () => {
        const { race, clock } = started();
        const endsAt = race.shared().endsAt!;
        act(race, "alice", { reveal: mineCells(race.field!)[0] });
        expect(race.resume(5000)).toBe(true);
        expect(race.shared().endsAt).toBe(endsAt + 5000);
        clock.now += PENALTY_MS;
        expect(race.own("alice")!.frozenMs).toBe(5000);
    });

    it("refuses what isn't an action, and too many at once", () => {
        const { race } = started();
        expect(race.act("alice", { acts: [{ reveal: -1 }] }).result).toMatchObject({
            ok: false,
            error: "That isn't an action",
        });
        expect(race.act("alice", { acts: [{ flag: 3 }] }).result).toMatchObject({ ok: false });
        expect(race.act("alice", {}).result).toMatchObject({ ok: false });
        const many = Array.from({ length: MAX_ACTS + 1 }, () => ({ reveal: 0 }));
        expect(race.act("alice", { acts: many }).result).toMatchObject({ ok: false });
        expect(race.act("carol", { acts: [] }).result).toMatchObject({
            ok: false,
            error: "You aren't in this race",
        });
        // None at all asks for the board
        expect(race.act("alice", { acts: [] })).toEqual({
            result: { ok: true, own: race.own("alice") },
            changed: false,
        });
    });

    it("reads back what the store wrote, with the same field", () => {
        const { race } = started();
        act(race, "alice", { reveal: safeHidden(race, "alice", true) });
        const data = JSON.parse(JSON.stringify(race.toJson())) as MinesData;
        const back = new MinesweeperRace(data);
        expect(mineCells(back.field!)).toEqual(mineCells(race.field!));
        expect(back.own("alice")!.view).toBe(view(race, "alice"));
        expect(back.shared()).toEqual(race.shared());
    });
});
