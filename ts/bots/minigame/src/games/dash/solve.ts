// Getting through a section (`sections.ts`), for its tests: whether a runner can, and how much
// leeway its jumps give. Every way of pressing the button is tried, a tick at a time, from the
// section's start, running on its flat ground, to its end, standing on its flat ground, which is
// where the next section starts. A way through mustn't run into a wall, which only a runner who's
// mistimed a jump does. Then a player who presses and lets go in the middle of whatever ticks
// would do is followed through, and the fewest ticks they had for any press or letting go is the
// section's leeway.
import { AIR, GROUND_ROWS, readSection, ROWS, SOLID, TILE, tileAt, type Course } from "./course";
import type { Section } from "./sections";
import {
    BUFFER_TICKS,
    CUT_SPEED,
    GRAVITY,
    JUMP_SPEED,
    MAX_FALL,
    RUN_SPEED,
    startRunner,
    step,
    WIDTH,
    type Runner,
} from "./runner";

/** The flat ground either side of the section */
const PAD = 3;

/** A runner's speed up on the tick it jumps */
const JUMPED = JUMP_SPEED - GRAVITY;

export type Passage = {
    /**
     * The fewest ticks the player had for a press, or for letting go, on the way through, or
     * Infinity if they never needed to time one
     */
    leeway: number;
    /** The button's changes that got them through, from the tick they set off */
    changes: number[];
};

/** The section on its own between flat ground, with no finish line: `through` says who's past */
export function sectionCourse(section: Section): Course {
    const read = readSection(section);
    if ("error" in read) throw new Error(`The section can't be read: ${read.error}`);
    const flat = Array.from({ length: ROWS }, (_, row) => (row < GROUND_ROWS ? SOLID : AIR));
    const columns = [...Array(PAD).fill(flat), ...read.columns, ...Array(PAD).fill(flat)];
    const tiles = new Uint8Array(columns.length * ROWS);
    columns.forEach((column, x) => tiles.set(column, x * ROWS));
    return {
        sections: [],
        width: columns.length,
        tiles,
        checkpoints: [1],
        finish: Number.MAX_SAFE_INTEGER,
    };
}

/** A runner at the section's start, running */
export function sectionRunner(course: Course): Runner {
    const r = startRunner(course);
    r.mode = "run";
    return r;
}

/** Whether the runner's through: standing on the flat ground after the section */
export function through(course: Course, r: Runner): boolean {
    return r.mode === "run" && r.ground && r.x >= (course.width - PAD) * TILE;
}

// A runner that hasn't run into anything is where its tick says across, so what tells one from
// another on a tick is the rest, packed into a number
function pack(r: Runner): number {
    let k = r.y + 1024;
    k = k * 512 + r.vy + 256;
    k = k * 2 + (r.ground ? 1 : 0);
    k = k * 8 + r.coyote;
    k = k * 8 + r.buffer;
    return k * 2 + (r.held ? 1 : 0);
}

function unpack(k: number, r: Runner): void {
    r.held = k % 2 === 1;
    k = Math.floor(k / 2);
    r.buffer = k % 8;
    k = Math.floor(k / 8);
    r.coyote = k % 8;
    k = Math.floor(k / 8);
    r.ground = k % 2 === 1;
    k = Math.floor(k / 2);
    r.vy = (k % 512) - 256;
    r.y = Math.floor(k / 512) - 1024;
}

/** The runners on each tick, from the start, and which can get through */
type Graph = {
    course: Course;
    /** The runner's left side on the start's tick, which it runs on from */
    x: number;
    tick: number;
    /** Each tick's runners, packed */
    layers: number[][];
    /** Each runner's next on the next tick, with the button up and down: -1 for none */
    next: Int32Array[];
    wins: Uint8Array[];
};

function explore(course: Course): Graph {
    const start = sectionRunner(course);
    const r = { ...start };
    const ahead = { ...start };
    const layers: number[][] = [[pack(start)]];
    const next: Int32Array[] = [];
    const done: Uint8Array[] = [];
    for (let t = 0; layers[t].length > 0; t++) {
        const layer = layers[t];
        const x = start.x + t * RUN_SPEED;
        const ids = new Map<number, number>();
        const following: number[] = [];
        const pairs = new Int32Array(layer.length * 2).fill(-1);
        const past = new Uint8Array(layer.length);
        // Whether a falling runner lands soon enough, with the button up, for a press now to jump
        // as it does, by where it is and its speed, the same for any state of the button
        const soon = new Map<number, boolean>();
        const landsSoon = (): boolean => {
            if (r.vy >= 0 || r.buffer > 0) return false;
            // Too high above anything it could land on in the time, which is most
            let fall = 0;
            for (let k = 1; k < BUFFER_TICKS; k++) fall += Math.min(k * GRAVITY - r.vy, MAX_FALL);
            const reach = r.x + BUFFER_TICKS * RUN_SPEED + WIDTH;
            if (r.y - fall >= floorUnder(course, r.x, reach, r.y)) return false;
            const where = Math.floor(pack(r) / 16);
            let lands = soon.get(where);
            if (lands === undefined) {
                Object.assign(ahead, r);
                lands = false;
                for (let k = 0; k < BUFFER_TICKS - 1 && ahead.mode === "run" && !lands; k++) {
                    step(course, ahead, false);
                    lands = ahead.ground;
                }
                soon.set(where, lands);
            }
            return lands;
        };
        layer.forEach((k, i) => {
            for (const pressed of [false, true]) {
                unpack(k, r);
                r.x = x;
                r.mode = "run";
                if (through(course, r)) {
                    past[i] = 1;
                    return;
                }
                // A press is tried only where it jumps, at once or as the runner lands: any other
                // only lapses
                if (pressed && !r.held && !r.ground && r.coyote === 0 && !landsSoon()) {
                    continue;
                }
                step(course, r, pressed);
                if (r.mode !== "run" || r.x !== x + RUN_SPEED) continue;
                // Once holding on makes no difference, as letting go can't cut the jump short and
                // no press is waiting to jump, a runner whose button's down can do no more than one
                // whose button's up, which can press it
                if (r.buffer === 0 && r.vy <= CUT_SPEED) r.held = false;
                const n = pack(r);
                let id = ids.get(n);
                if (id === undefined) {
                    id = following.length;
                    ids.set(n, id);
                    following.push(n);
                }
                pairs[i * 2 + (pressed ? 1 : 0)] = id;
            }
        });
        next.push(pairs);
        done.push(past);
        layers.push(following);
    }
    // Back from those through, a tick at a time
    const wins: Uint8Array[] = layers.map((layer) => new Uint8Array(layer.length));
    for (let t = next.length - 1; t >= 0; t--) {
        const pairs = next[t];
        for (let i = 0; i < layers[t].length; i++) {
            const up = pairs[i * 2];
            const down = pairs[i * 2 + 1];
            const on = (n: number) => n >= 0 && wins[t + 1][n] === 1;
            wins[t][i] = done[t][i] === 1 || on(up) || on(down) ? 1 : 0;
        }
    }
    return { course, x: start.x, tick: start.tick, layers, next, wins };
}

/** The top of the highest solid tile under `y` in the columns from `left` to `right` */
function floorUnder(course: Course, left: number, right: number, y: number): number {
    let top = -Infinity;
    for (let c = Math.floor(left / TILE); c <= Math.floor((right - 1) / TILE); c++) {
        for (let row = Math.floor((y - 1) / TILE); row >= 0; row--) {
            if (tileAt(course, c, row) === SOLID) {
                top = Math.max(top, (row + 1) * TILE);
                break;
            }
        }
    }
    return top;
}

/** The longest run of ticks that do, and the tick in its middle */
function widest(good: readonly boolean[]): { length: number; middle: number } {
    let best = { length: 0, middle: -1 };
    let from = -1;
    for (let i = 0; i <= good.length; i++) {
        if (good[i] === true) {
            if (from < 0) from = i;
        } else if (from >= 0) {
            if (i - from > best.length) {
                best = { length: i - from, middle: from + ((i - from - 1) >> 1) };
            }
            from = -1;
        }
    }
    return best;
}

/**
 * How a player gets through the section, pressing and letting go in the middle of the ticks that
 * would do each time, with the fewest ticks they had; undefined if no one can get through
 */
export function passage(section: Section): Passage | undefined {
    const g = explore(sectionCourse(section));
    if (g.wins[0][0] !== 1) return undefined;
    const r = sectionRunner(g.course);
    /** The runner on a tick, by its place on the tick, as it was unpacked */
    const at = (t: number, i: number): Runner => {
        unpack(g.layers[t][i], r);
        r.x = g.x + t * RUN_SPEED;
        return r;
    };
    const follow = (t: number, i: number, pressed: boolean) => g.next[t][i * 2 + (pressed ? 1 : 0)];
    const wins = (t: number, i: number) => i >= 0 && g.wins[t][i] === 1;

    let leeway = Infinity;
    const changes: number[] = [];
    let t = 0;
    let i = 0;
    for (;;) {
        // Running on with the button up, until the runner's through or would fall: where it last
        // stands is the obstacle's edge, which a jump has to clear, rather than land short of
        const up: number[] = [];
        let edge = -Infinity;
        for (let j = i; j >= 0; j = follow(t + up.length - 1, j, false)) {
            up.push(j);
            const here = at(t + up.length - 1, j);
            if (through(g.course, here)) return { leeway, changes };
            if (here.ground) edge = here.x;
        }
        // Each press's jumps, by when it's let go of, that get through and clear the edge
        const jumps = up.map((j, k) => {
            const pressed = follow(t + k, j, true);
            return wins(t + k + 1, pressed) ? jump(t + k + 1, pressed, edge) : undefined;
        });
        const clears = jumps.map((jp) => jp?.lets.some(Boolean) === true);
        const press = widest(clears);
        if (press.length === 0) throw new Error(`No jump gets through after tick ${t}`);
        leeway = Math.min(leeway, press.length);
        const { wait, rising, lets } = jumps[press.middle]!;
        t += press.middle + 1;
        changes.push(t + g.tick);
        // Held until it jumps, and while it rises, when letting go cuts the jump short. Unless it
        // does as well held all the way up, when the player needn't let go at any tick in
        // particular.
        t += wait;
        let chosen = lets.length - 1;
        if (!lets[chosen]) {
            const letGo = widest(lets);
            leeway = Math.min(leeway, letGo.length);
            chosen = letGo.middle;
        }
        i = follow(t + chosen, rising[chosen], false);
        t += chosen + 1;
        changes.push(t + g.tick);
    }

    /**
     * The jump from a runner that's just been pressed: the ticks it's held until it jumps, the
     * runners as it rises, and whether letting go at each gets through having cleared the edge.
     * Undefined if the press lapses before it jumps, as a wasted one.
     */
    function jump(t: number, i: number, edge: number) {
        const wait = jumpTicks(g, t, i);
        if (wait === undefined) return undefined;
        for (let k = 0; k < wait; k++) i = follow(t++, i, true);
        const rising = [i];
        while (at(t + rising.length - 1, rising[rising.length - 1]).vy > CUT_SPEED) {
            const n = follow(t + rising.length - 1, rising[rising.length - 1], true);
            if (n < 0) break;
            rising.push(n);
        }
        const lets = rising.map((j, k) => {
            let n = follow(t + k, j, false);
            if (!wins(t + k + 1, n)) return false;
            // Where it next stands
            for (let u = t + k + 1; n >= 0; n = follow(u++, n, false)) {
                const r = at(u, n);
                if (r.ground || through(g.course, r)) return r.x > edge;
            }
            return false;
        });
        return { wait, rising, lets };
    }
}

/**
 * How many ticks a runner that's just been pressed, held, takes to jump: 0 if it just has, or
 * undefined if the press lapses first
 */
function jumpTicks(g: Graph, t: number, i: number): number | undefined {
    const r = sectionRunner(g.course);
    for (let k = 0; k <= BUFFER_TICKS && i >= 0; k++) {
        unpack(g.layers[t + k][i], r);
        if (r.vy === JUMPED) return k;
        i = g.next[t + k][i * 2 + 1];
    }
    return undefined;
}
