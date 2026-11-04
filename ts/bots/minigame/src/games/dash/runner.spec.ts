import { describe, expect, it } from "vitest";
import { GROUND_ROWS, readRows, ROWS, TILE, type Course } from "./course";
import {
    FALL_TICKS,
    GRAVITY,
    HEIGHT,
    isChanges,
    JUMP_SPEED,
    RUN_SPEED,
    runTo,
    startRunner,
    step,
    type Runner,
} from "./runner";

const GROUND = GROUND_ROWS * TILE;

/** A course of these rows, top first, with a checkpoint at column 1 and another at `checkpoint` */
function course(rows: string[], checkpoint?: number, finish = Number.MAX_SAFE_INTEGER): Course {
    const read = readRows(rows);
    if ("error" in read) throw new Error(read.error);
    const tiles = new Uint8Array(read.columns.length * ROWS);
    read.columns.forEach((column, x) => tiles.set(column, x * ROWS));
    return {
        sections: [],
        width: read.columns.length,
        tiles,
        checkpoints: checkpoint === undefined ? [1] : [1, checkpoint],
        finish,
    };
}

const FLAT = course(["#".repeat(40), "#".repeat(40)]);

/** A runner that's been set off, at tick 0 */
function running(c: Course): Runner {
    const r = startRunner(c);
    step(c, r, true);
    step(c, r, false);
    return r;
}

/** How many ticks the runner takes to land, with the button up */
function ticksToLand(c: Course, r: Runner): number {
    const ahead = { ...r };
    let ticks = 0;
    do {
        step(c, ahead, false);
        ticks++;
    } while (!ahead.ground && ahead.mode === "run");
    return ticks;
}

/** The runner, having jumped past `x` on the first tick that does, holding the button a while */
function jumpPast(c: Course, r: Runner, x: number): Runner | undefined {
    for (let wait = 0; wait < 60; wait++) {
        const n = { ...r };
        for (let t = 0; t < wait; t++) step(c, n, false);
        for (let t = 0; t < 80 && n.mode === "run" && n.x < x; t++) step(c, n, t < 20);
        if (n.mode === "run") return n;
    }
    return undefined;
}

/** How high the runner gets above the ground, pressed for `hold` ticks from now */
function jumpHeight(hold: number): number {
    const r = running(FLAT);
    let top = r.y;
    for (let t = 0; t < 60; t++) {
        step(FLAT, r, t < hold);
        top = Math.max(top, r.y);
    }
    return (top - GROUND) / TILE;
}

describe("a Dash runner", () => {
    it("waits at the start until the button's pressed, then runs on by itself", () => {
        const r = startRunner(FLAT);
        const x = r.x;
        for (let t = 0; t < 30; t++) step(FLAT, r, false);
        expect(r).toMatchObject({ mode: "ready", x, tick: 29 });
        step(FLAT, r, true);
        expect(r.mode).toBe("run");
        // The press only sets it off
        expect(r.x).toBe(x);
        step(FLAT, r, true);
        step(FLAT, r, false);
        expect(r).toMatchObject({ x: x + 2 * RUN_SPEED, y: GROUND, ground: true });
        expect(r.furthestAt).toBe(32);
    });

    it("jumps higher the longer the button's held, up to near three tiles", () => {
        const tap = jumpHeight(1);
        const longer = jumpHeight(6);
        const full = jumpHeight(30);
        expect(tap).toBeLessThan(1);
        expect(longer).toBeGreaterThan(tap);
        expect(full).toBeGreaterThan(longer);
        expect(full).toBeGreaterThan(2.5);
        expect(full).toBeLessThan(3);
        // Held on, it doesn't jump again as it lands: that takes another press
        const r = running(FLAT);
        for (let t = 0; t < 60; t++) step(FLAT, r, true);
        expect(r).toMatchObject({ y: GROUND, ground: true });
    });

    it("still jumps just after running off an edge, or pressed just before it lands", () => {
        const ledge = course(["#####..........", "#####.........."]);
        const late = running(ledge);
        while (late.ground) step(ledge, late, false);
        step(ledge, late, true);
        expect(late.vy).toBeGreaterThan(0);
        // But only the once
        step(ledge, late, false);
        step(ledge, late, true);
        expect(late.vy).toBeLessThan(JUMP_SPEED - 2 * GRAVITY);

        // Falling from a jump, a press a few ticks before it lands jumps as it does
        const early = running(FLAT);
        for (let t = 0; t < 15; t++) step(FLAT, early, true);
        while (ticksToLand(FLAT, early) > 3) step(FLAT, early, false);
        step(FLAT, early, true);
        expect(early.ground).toBe(false);
        while (early.vy <= 0) step(FLAT, early, true);
        expect(early.y).toBeLessThan(GROUND + 2 * JUMP_SPEED);
    });

    it("stops against a wall, and gets over it with a jump", () => {
        const wall = course([
            "......#........",
            "......#........",
            "###############",
            "###############",
        ]);
        const r = running(wall);
        for (let t = 0; t < 40; t++) step(wall, r, false);
        const stuck = r.x;
        step(wall, r, false);
        expect(r).toMatchObject({ x: stuck, mode: "run", ground: true });
        step(wall, r, true);
        for (let t = 0; t < 40; t++) step(wall, r, true);
        expect(r.x).toBeGreaterThan(7 * TILE);
    });

    it("falls on a spike or down a pit, and starts again from its last checkpoint", () => {
        const spikes = course(["......^......^..", "################", "################"], 8);
        const r = running(spikes);
        for (let t = 0; t < 60 && r.mode === "run"; t++) step(spikes, r, false);
        expect(r).toMatchObject({ mode: "fallen", falls: 1, checkpoint: 0 });
        for (let t = 0; t < FALL_TICKS; t++) step(spikes, r, false);
        expect(r).toMatchObject({ mode: "ready", x: TILE + 16, y: GROUND });
        // Over the first, past the checkpoint, and onto the second
        step(spikes, r, true);
        const over = jumpPast(spikes, r, 9 * TILE)!;
        for (let t = 0; t < 60 && over.mode === "run"; t++) step(spikes, over, false);
        expect(over).toMatchObject({ mode: "fallen", falls: 2, checkpoint: 1 });
        for (let t = 0; t < FALL_TICKS; t++) step(spikes, over, false);
        expect(over.x).toBe(8 * TILE + 16);

        const pit = course(["#####.....#####", "#####.....#####"]);
        const p = running(pit);
        for (let t = 0; t < 80 && p.mode === "run"; t++) step(pit, p, false);
        expect(p.mode).toBe("fallen");
        expect(p.y + HEIGHT).toBeLessThanOrEqual(0);
    });

    it("finishes as it crosses the finish line", () => {
        const c = course(["#".repeat(40), "#".repeat(40)], undefined, 10);
        const r = startRunner(c);
        runTo(c, r, [5], 200);
        expect(r.mode).toBe("done");
        // Set off at tick 5, from just past column 1, at 30 a tick
        expect(r.finished).toBe(5 + Math.ceil((9 * TILE - 16) / RUN_SPEED));
        expect(r.tick).toBe(r.finished);
    });

    it("runs the same, run to a tick at a time or all at once, waiting skipped", () => {
        const c = course(["....^.....^.....####......", "#".repeat(26), "#".repeat(26)]);
        const changes = [200, 210, 236, 250, 270, 271, 300, 330];
        const once = startRunner(c);
        runTo(c, once, changes, 600);
        const ticks = startRunner(c);
        for (let t = 0; t <= 600; t++) runTo(c, ticks, changes, t);
        expect(ticks).toEqual(once);
        const stepped = startRunner(c);
        let down = 0;
        for (let t = 0; t <= 600; t++) {
            while (down < changes.length && changes[down] <= t) down++;
            step(c, stepped, down % 2 === 1);
        }
        expect(stepped).toEqual(once);
    });

    it("takes a run's changes only as whole ticks, in order", () => {
        expect(isChanges([0, 4, 9], 3)).toBe(true);
        expect(isChanges([], 3)).toBe(true);
        expect(isChanges([4, 4], 3)).toBe(false);
        expect(isChanges([5, 4], 3)).toBe(false);
        expect(isChanges([1.5], 3)).toBe(false);
        expect(isChanges([-1], 3)).toBe(false);
        expect(isChanges([1, 2, 3, 4], 3)).toBe(false);
        expect(isChanges("1,2", 3)).toBe(false);
    });
});
