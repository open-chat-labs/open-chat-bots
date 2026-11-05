// A Dash racer's runner, and how it moves: it runs to the right by itself, and the one button
// jumps, higher the longer it's held. It's moved a tick at a time, 60 to the second, in whole
// numbers only, so the page, which plays the racer's presses as they make them, and the bot, which
// plays them again to check them, end up in exactly the same place. A racer's run is the ticks
// their button went down and came up, its changes, counted from the race's start, so the bot can
// play it again from those alone.
//
// Every runner sets off on the same tick, a count of three after the race starts, so everyone
// starts together. After a fall, it waits at the last checkpoint until the button's pressed: a
// runner whose racer isn't looking doesn't fall again and again. A fall is into a spike, or off
// the bottom of the course. Running into a wall only stops it, until it jumps.
import { GROUND_ROWS, SOLID, SPIKE_DOWN, SPIKE_UP, TILE, tileAt, type Course } from "./course";

export const TICKS_PER_SECOND = 60;

/** The tick every runner sets off on, after a count of three from the race's start */
export const START_TICK = 3 * TICKS_PER_SECOND;

/** How far the runner runs in a tick: seven tiles a second, near enough */
export const RUN_SPEED = 30;
/** Taken off its speed up every tick it's in the air */
export const GRAVITY = 4;
/** Its speed up as it jumps, and what that's cut to when the button comes up while it's rising */
export const JUMP_SPEED = 78;
export const CUT_SPEED = 36;
/** The fastest it falls, which is less than a tile a tick, so it can't fall through one */
export const MAX_FALL = 160;
/** How many ticks it can still jump after running off an edge */
export const COYOTE_TICKS = 5;
/** How many ticks a press before it lands still jumps as it does */
export const BUFFER_TICKS = 6;
/** How long a fall lasts, before the runner's back at the last checkpoint */
export const FALL_TICKS = 36;

/** The runner's size */
export const WIDTH = 176;
export const HEIGHT = 208;

/** How far in from the edge of a spike's tile it hurts, and how high */
const SPIKE_INSET = 48;
const SPIKE_HEIGHT = 150;

/** Where the runner stands at a checkpoint, from its column's left side */
const SPAWN_OFFSET = 16;

export type Mode = "start" | "ready" | "run" | "fallen" | "done";

export type Runner = {
    /**
     * Waiting to set off, at the start; waiting for the button, after a fall; running; falling,
     * before it starts again; or finished
     */
    mode: Mode;
    /** The last tick it's been moved through, counted from the race's start: -1 before the first */
    tick: number;
    /** Its bottom left corner, in tile units from the course's bottom left */
    x: number;
    y: number;
    /** Its speed up, or down when it's below 0 */
    vy: number;
    /** Whether it's standing on something */
    ground: boolean;
    /** The ticks left to jump after running off an edge, and those for which a press still counts */
    coyote: number;
    buffer: number;
    /** Whether the button was down last tick */
    held: boolean;
    /** The ticks left of a fall */
    wait: number;
    /** The checkpoint it starts again from, by its place in the course's: 0 is the start */
    checkpoint: number;
    /** The furthest it's been, and the tick it got there */
    furthest: number;
    furthestAt: number;
    falls: number;
    /** The tick it crossed the finish line */
    finished?: number;
};

/** A runner at the start, waiting to set off */
export function startRunner(course: Course): Runner {
    const runner: Runner = {
        mode: "start",
        tick: -1,
        x: 0,
        y: 0,
        vy: 0,
        ground: true,
        coyote: 0,
        buffer: 0,
        held: false,
        wait: 0,
        checkpoint: 0,
        furthest: 0,
        furthestAt: -1,
        falls: 0,
    };
    spawn(course, runner);
    runner.mode = "start";
    runner.furthest = runner.x;
    return runner;
}

/** Puts the runner at its checkpoint, waiting for the button */
function spawn(course: Course, r: Runner): void {
    r.mode = "ready";
    r.x = course.checkpoints[r.checkpoint] * TILE + SPAWN_OFFSET;
    r.y = GROUND_ROWS * TILE;
    r.vy = 0;
    r.ground = true;
    r.coyote = 0;
    r.buffer = 0;
}

/** Whether the runner, with its bottom left corner here, would be in anything solid */
function inSolid(course: Course, x: number, y: number): boolean {
    for (let c = Math.floor(x / TILE); c <= Math.floor((x + WIDTH - 1) / TILE); c++) {
        for (let row = Math.floor(y / TILE); row <= Math.floor((y + HEIGHT - 1) / TILE); row++) {
            if (tileAt(course, c, row) === SOLID) return true;
        }
    }
    return false;
}

/** Whether the runner, with its bottom left corner here, is on a spike's point */
function onSpike(course: Course, x: number, y: number): boolean {
    for (let c = Math.floor(x / TILE); c <= Math.floor((x + WIDTH - 1) / TILE); c++) {
        const left = c * TILE + SPIKE_INSET;
        const right = (c + 1) * TILE - SPIKE_INSET;
        if (x >= right || x + WIDTH <= left) continue;
        for (let row = Math.floor(y / TILE); row <= Math.floor((y + HEIGHT - 1) / TILE); row++) {
            const tile = tileAt(course, c, row);
            if (tile !== SPIKE_UP && tile !== SPIKE_DOWN) continue;
            const bottom = tile === SPIKE_UP ? row * TILE : (row + 1) * TILE - SPIKE_HEIGHT;
            if (y < bottom + SPIKE_HEIGHT && y + HEIGHT > bottom) return true;
        }
    }
    return false;
}

/** Moves the runner on a tick, with the button down or not that tick */
export function step(course: Course, r: Runner, pressed: boolean): void {
    r.tick++;
    const press = pressed && !r.held;
    r.held = pressed;
    switch (r.mode) {
        case "done":
            return;
        case "fallen":
            if (--r.wait <= 0) spawn(course, r);
            return;
        case "start":
            // Off with everyone else's, whatever the button's done
            if (r.tick < START_TICK) return;
            r.mode = "run";
            break;
        case "ready":
            // The press only sets it off: it jumps on the next
            if (press) r.mode = "run";
            return;
    }

    if (press) r.buffer = BUFFER_TICKS;
    else if (r.buffer > 0) r.buffer--;
    const wasGround = r.ground;
    let jumped = false;
    if (r.buffer > 0 && (r.ground || r.coyote > 0)) {
        r.vy = JUMP_SPEED;
        r.buffer = 0;
        // Off an edge, it jumps the once
        r.coyote = 0;
        jumped = true;
    }
    // Let go of while it's rising, it doesn't rise as far
    if (!pressed && r.vy > CUT_SPEED) r.vy = CUT_SPEED;

    // Across, up against a wall if there's one in the way
    let x = r.x + RUN_SPEED;
    if (inSolid(course, x, r.y)) x = Math.floor((x + WIDTH - 1) / TILE) * TILE - WIDTH;
    r.x = Math.max(r.x, x);

    // Up or down, onto the floor or against a ceiling
    r.vy = Math.max(r.vy - GRAVITY, -MAX_FALL);
    let y = r.y + r.vy;
    r.ground = false;
    if (inSolid(course, r.x, y)) {
        if (r.vy < 0) {
            y = (Math.floor(y / TILE) + 1) * TILE;
            r.ground = true;
        } else {
            y = Math.floor((y + HEIGHT - 1) / TILE) * TILE - HEIGHT;
        }
        r.vy = 0;
    }
    r.y = y;
    if (r.ground) r.coyote = 0;
    else if (wasGround && !jumped) r.coyote = COYOTE_TICKS;
    else if (r.coyote > 0) r.coyote--;

    if (onSpike(course, r.x, r.y) || r.y + HEIGHT <= 0) {
        r.mode = "fallen";
        r.wait = FALL_TICKS;
        r.falls++;
        return;
    }
    while (
        r.checkpoint + 1 < course.checkpoints.length &&
        r.x >= course.checkpoints[r.checkpoint + 1] * TILE
    ) {
        r.checkpoint++;
    }
    if (r.x > r.furthest) {
        r.furthest = r.x;
        r.furthestAt = r.tick;
    }
    if (r.x >= course.finish * TILE) {
        r.mode = "done";
        r.finished = r.tick;
    }
}

/**
 * Moves the runner on through tick `to`, the button going down at the first of `changes`, up at
 * the next, and so on: they're ticks, in order, the button down from the first, third and so on.
 * Waiting to set off, it skips straight to the tick before, and waiting for the button, to its
 * next change.
 */
export function runTo(course: Course, r: Runner, changes: readonly number[], to: number): void {
    let next = 0;
    while (next < changes.length && changes[next] <= r.tick) next++;
    while (r.tick < to && r.mode !== "done") {
        if (r.mode === "start" && r.tick < START_TICK - 1) {
            // Nothing happens until it sets off, whatever the button does
            r.tick = Math.min(to, START_TICK - 1);
            while (next < changes.length && changes[next] <= r.tick) next++;
            r.held = next % 2 === 1;
            continue;
        }
        if (r.mode === "ready") {
            // Nothing happens until the button's next change
            const skip = Math.min(to, (changes[next] ?? Infinity) - 1);
            if (skip > r.tick) {
                r.tick = skip;
                r.held = next % 2 === 1;
                continue;
            }
        }
        while (next < changes.length && changes[next] <= r.tick + 1) next++;
        step(course, r, next % 2 === 1);
    }
}

/** Whether `value` is a run's button changes: up to `most` ticks, each a whole number after the last */
export function isChanges(value: unknown, most: number): value is number[] {
    if (!Array.isArray(value) || value.length > most) return false;
    let last = -1;
    for (const tick of value) {
        if (!Number.isSafeInteger(tick) || tick <= last) return false;
        last = tick;
    }
    return true;
}
