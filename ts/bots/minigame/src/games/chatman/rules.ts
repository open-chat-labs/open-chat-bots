// ChatMan's rules: one player's board, a tick at a time, 20 ticks a second. ChatMan runs until a
// wall, turning at the next junction the player's last turn allows, or at once if it's back the way
// he came. He eats the dots, and a power pellet frightens the four spam bots for a while, when he
// can eat them too. Otherwise a spam bot that catches him costs a life, and the level starts again
// with the dots he's left. A cleared maze is the next level's, with quicker spam bots.
//
// The spam bots leave the pen one by one, then take turns at each junction towards a target: their
// corners for a few seconds, then ChatMan, each in its own way. One goes straight for him, one for
// the tiles ahead of him, one wanders, and one makes for its corner once it's close. Frightened,
// they slow down and wander. It's integers only, and the wandering comes from the board's own seeded
// source, so the bot and the page play a board the same way from the same turns: the page plays
// ahead at once, and the bot replays the turns to check (`race.ts`). Built from scratch.
import {
    chatMaze,
    DOOR,
    DOWN,
    DX,
    DY,
    HEIGHT,
    LEFT,
    OUTSIDE,
    PATH,
    PELLET,
    PEN,
    PEN_TILES,
    reverse,
    RIGHT,
    START,
    tileAt,
    UP,
    WIDTH,
    type ChatMaze,
    type Dir,
} from "./maze";

export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** A tile's width in the steps an actor moves a tick */
export const SUB = 24;
const MAN_SPEED = 8;
const LEAVING_SPEED = 4;
const FRIGHTENED_SPEED = 4;
/** The spam bots get quicker from the third level */
function botSpeed(level: number): number {
    return level >= 3 ? 7 : 6;
}
/** How long a pellet frightens the spam bots: 8 seconds, a second less each level, 3 at least */
export function frightTicks(level: number): number {
    return Math.max(3, 9 - level) * TICKS_PER_SECOND;
}
/** A turn this far into leaving a tile still takes the way it was meant for */
const LATE_TURN = SUB / 3;

export const DOT_POINTS = 10;
export const PELLET_POINTS = 50;
/** A frightened spam bot is worth this, doubled for each eaten since the pellet: 100 to 800 */
export const BOT_POINTS = 100;

/** The pause after ChatMan's caught, and after a level's cleared */
export const CAUGHT_TICKS = 30;
export const CLEARED_TICKS = 40;
/** The spam bots leave the pen this far apart, and an eaten one waits this long to leave again */
const RELEASE_TICKS = 60;
const EATEN_TICKS = 40;
/** The spam bots make for their corners, then chase, three times, and then they only chase */
const SCATTER_TICKS = 5 * TICKS_PER_SECOND;
const CHASE_TICKS = 20 * TICKS_PER_SECOND;
const WAVES = 3;

/** Where a spam bot is: waiting in the pen, on its way out, or out in the maze */
export const HOME = 0;
export const LEAVING = 1;
export const ROAMING = 2;
export type Mode = typeof HOME | typeof LEAVING | typeof ROAMING;

/** What follows a pause */
const NOTHING = 0;
const CAUGHT = 1;
const CLEARED = 2;

/** Each spam bot's corner, beyond the maze's, which it heads for between chases */
const CORNERS: readonly { x: number; y: number }[] = [
    { x: WIDTH - 2, y: -2 },
    { x: 1, y: -2 },
    { x: WIDTH - 2, y: HEIGHT + 1 },
    { x: 1, y: HEIGHT + 1 },
];
/** The order a spam bot weighs its ways in, which settles a tie */
const PREFERENCE: readonly Dir[] = [UP, LEFT, DOWN, RIGHT];

export type Man = {
    x: number;
    y: number;
    /** The way he's facing, and going while he's moving */
    d: Dir;
    /** How far he is from his tile towards the next, in `SUB`ths */
    p: number;
    /** The way the player last turned him, which he takes when he can */
    w: Dir;
    moving: boolean;
};

export type Bot = {
    x: number;
    y: number;
    d: Dir;
    p: number;
    mode: Mode;
    /** Ticks until it leaves the pen, while it's home */
    wait: number;
    frightened: boolean;
};

export type Board = {
    /** Ticks played */
    t: number;
    /** The number of the player's last turn the board has taken */
    n: number;
    level: number;
    score: number;
    lives: number;
    /** Out of lives */
    out: boolean;
    /** Ticks since the level, or the life, started, which the spam bots' timing runs on */
    clock: number;
    /** Ticks left of a pause, and what follows it */
    pause: number;
    after: number;
    /** Ticks left of the spam bots' fright, and how many ChatMan's eaten in it */
    fright: number;
    eaten: number;
    /** The seeded source the spam bots wander by, as it stands */
    rng: number;
    /** What's left on each tile: nothing, a dot or a pellet */
    food: Uint8Array;
    left: number;
    man: Man;
    bots: Bot[];
};

/** A player's turn: the way, the tick it's taken at, and its number, counting from 1 */
export type Turn = { n: number; t: number; d: Dir };

/** A new board: the first level, the dots all there, and ChatMan off to the left */
export function newBoard(seed: number, lives: number): Board {
    const maze = chatMaze(seed, 1);
    const board: Board = {
        t: 0,
        n: 0,
        level: 1,
        score: 0,
        lives,
        out: false,
        clock: 0,
        pause: 0,
        after: NOTHING,
        fright: 0,
        eaten: 0,
        rng: (seed ^ 0x5bd1e995) >>> 0,
        food: maze.food.slice(),
        left: maze.foodTiles.length,
        man: { ...START, d: LEFT, p: 0, w: LEFT, moving: true },
        bots: [],
    };
    restart(board);
    return board;
}

/** The mazes a board plays, one a level, built once each */
export class Mazes {
    readonly seed: number;
    readonly #levels = new Map<number, ChatMaze>();

    constructor(seed: number) {
        this.seed = seed;
    }

    level(level: number): ChatMaze {
        let maze = this.#levels.get(level);
        if (maze === undefined) {
            maze = chatMaze(this.seed, level);
            this.#levels.set(level, maze);
        }
        return maze;
    }
}

/** Takes a turn: ChatMan goes that way as soon as he can */
export function turn(board: Board, t: Turn): void {
    board.man.w = t.d;
    board.n = t.n;
}

/**
 * Plays the board on to tick `to`, taking each turn at its tick, as they come in `turns`, which
 * are in order. Returns the turns it didn't reach.
 */
export function play(board: Board, mazes: Mazes, turns: readonly Turn[], to: number): Turn[] {
    let i = 0;
    while (board.t < to) {
        while (i < turns.length && turns[i].t <= board.t) turn(board, turns[i++]);
        if (board.out) {
            // Nothing moves once he's out: the turns to come are taken, for what they're worth
            board.t = to;
            while (i < turns.length && turns[i].t <= to) turn(board, turns[i++]);
            break;
        }
        step(board, mazes);
    }
    return turns.slice(i);
}

/** One tick */
export function step(board: Board, mazes: Mazes): void {
    board.t++;
    if (board.out) return;
    if (board.pause > 0) {
        if (--board.pause === 0) afterPause(board, mazes);
        return;
    }
    const maze = mazes.level(board.level);
    const wasScatter = scattering(board.clock);
    board.clock++;
    // Between scattering and chasing, the spam bots out in the maze turn round
    if (scattering(board.clock) !== wasScatter) {
        for (const bot of board.bots) {
            if (bot.mode === ROAMING && !bot.frightened) turnRound(bot, maze);
        }
    }
    if (board.fright > 0 && --board.fright === 0) {
        for (const bot of board.bots) bot.frightened = false;
    }
    const manWas = nearest(board.man);
    const botsWere = board.bots.map(nearest);
    moveMan(board.man, maze);
    eat(board, maze);
    if (board.left === 0) {
        board.pause = CLEARED_TICKS;
        board.after = CLEARED;
        return;
    }
    board.bots.forEach((bot, i) => moveBot(board, bot, i, maze));
    catchUp(board, manWas, botsWere);
}

function afterPause(board: Board, mazes: Mazes): void {
    const after = board.after;
    board.after = NOTHING;
    if (after === CAUGHT) {
        if (board.lives === 0) {
            board.out = true;
            return;
        }
        restart(board);
    } else if (after === CLEARED) {
        board.level++;
        const next = mazes.level(board.level);
        board.food = next.food.slice();
        board.left = next.foodTiles.length;
        restart(board);
    }
}

/** ChatMan back at the start, and the spam bots back in the pen, for a new life or level */
function restart(board: Board): void {
    board.man = { ...START, d: LEFT, p: 0, w: LEFT, moving: true };
    board.bots = PEN_TILES.map((tile, i) => ({
        ...tile,
        d: tile.x === START.x ? UP : tile.x < START.x ? RIGHT : LEFT,
        p: 0,
        mode: HOME,
        wait: i * RELEASE_TICKS,
        frightened: false,
    }));
    board.clock = 0;
    board.fright = 0;
    board.eaten = 0;
}

function scattering(clock: number): boolean {
    return clock < WAVES * (SCATTER_TICKS + CHASE_TICKS) && clock % (SCATTER_TICKS + CHASE_TICKS) < SCATTER_TICKS;
}

/** The tile an actor is mostly on: its own, or the next once it's half way there */
export function nearest(actor: { x: number; y: number; d: Dir; p: number }): number {
    const ahead = actor.p * 2 >= SUB;
    return (actor.y + (ahead ? DY[actor.d] : 0)) * WIDTH + actor.x + (ahead ? DX[actor.d] : 0);
}

function manCanGo(maze: ChatMaze, x: number, y: number, d: Dir): boolean {
    return tileAt(maze, x + DX[d], y + DY[d]) === PATH;
}

/** Back the way it came, from wherever it is between two tiles */
function turnRound(actor: { x: number; y: number; d: Dir; p: number }, maze: ChatMaze): void {
    const back = reverse(actor.d);
    if (actor.p > 0) {
        actor.x += DX[actor.d];
        actor.y += DY[actor.d];
        actor.p = SUB - actor.p;
        actor.d = back;
    } else if (tileAt(maze, actor.x + DX[back], actor.y + DY[back]) === PATH) {
        actor.d = back;
    }
}

function moveMan(man: Man, maze: ChatMaze): void {
    if (man.w !== man.d) {
        if (man.w === reverse(man.d) && man.p > 0) {
            // Back the way he came, at once
            turnRound(man, maze);
            man.moving = true;
        } else if (man.p <= LATE_TURN && manCanGo(maze, man.x, man.y, man.w)) {
            // At a junction, or only just past it: that way
            man.d = man.w;
            man.p = 0;
            man.moving = true;
        }
    }
    if (!man.moving) return;
    man.p += MAN_SPEED;
    if (man.p < SUB) return;
    man.p -= SUB;
    man.x += DX[man.d];
    man.y += DY[man.d];
    if (man.w !== man.d && manCanGo(maze, man.x, man.y, man.w)) man.d = man.w;
    if (!manCanGo(maze, man.x, man.y, man.d)) {
        man.moving = false;
        man.p = 0;
    }
}

function eat(board: Board, maze: ChatMaze): void {
    const tile = nearest(board.man);
    const food = board.food[tile];
    if (food === 0) return;
    board.food[tile] = 0;
    board.left--;
    if (food !== PELLET) {
        board.score += DOT_POINTS;
        return;
    }
    board.score += PELLET_POINTS;
    board.fright = frightTicks(board.level);
    board.eaten = 0;
    for (const bot of board.bots) {
        if (bot.mode === HOME) continue;
        if (bot.mode === ROAMING && !bot.frightened) turnRound(bot, maze);
        bot.frightened = true;
    }
}

/** How far an actor moves a tick, in `SUB`ths, eg. for the page to draw it between ticks */
export function speedOf(board: Board, actor: Man | Bot): number {
    if (!("mode" in actor)) return actor.moving ? MAN_SPEED : 0;
    if (actor.mode === HOME) return 0;
    if (actor.frightened) return FRIGHTENED_SPEED;
    return actor.mode === LEAVING ? LEAVING_SPEED : botSpeed(board.level);
}

function botCanGo(maze: ChatMaze, bot: Bot, x: number, y: number): boolean {
    const tile = tileAt(maze, x, y);
    return tile === PATH || (bot.mode === LEAVING && (tile === DOOR || tile === PEN));
}

function moveBot(board: Board, bot: Bot, i: number, maze: ChatMaze): void {
    if (bot.mode === HOME) {
        if (bot.wait > 0) bot.wait--;
        else bot.mode = LEAVING;
        return;
    }
    bot.p += speedOf(board, bot);
    if (bot.p < SUB) return;
    bot.p -= SUB;
    bot.x += DX[bot.d];
    bot.y += DY[bot.d];
    if (bot.mode === LEAVING && bot.x === OUTSIDE.x && bot.y === OUTSIDE.y) bot.mode = ROAMING;
    // Which way on from here, never back the way it came unless there's no other
    const ways = PREFERENCE.filter(
        (d) => d !== reverse(bot.d) && botCanGo(maze, bot, bot.x + DX[d], bot.y + DY[d]),
    );
    if (ways.length === 0) {
        bot.d = reverse(bot.d);
        return;
    }
    if (ways.length === 1) {
        bot.d = ways[0];
        return;
    }
    const wanders =
        bot.mode === ROAMING && (bot.frightened || (i === 2 && !scattering(board.clock)));
    if (wanders) {
        bot.d = ways[random(board) % ways.length];
        return;
    }
    const target = targetOf(board, bot, i);
    let best = ways[0];
    let bestDistance = Infinity;
    for (const d of ways) {
        const dx = bot.x + DX[d] - target.x;
        const dy = bot.y + DY[d] - target.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            best = d;
            bestDistance = distance;
        }
    }
    bot.d = best;
}

/** Where a spam bot's heading, each in its own way */
function targetOf(board: Board, bot: Bot, i: number): { x: number; y: number } {
    if (bot.mode === LEAVING) return OUTSIDE;
    const corner = CORNERS[i];
    if (scattering(board.clock)) return corner;
    const { man } = board;
    switch (i) {
        case 1:
            // Ahead of him, to cut him off
            return { x: man.x + 4 * DX[man.d], y: man.y + 4 * DY[man.d] };
        case 3: {
            // Straight for him from afar, and home once it's close
            const dx = bot.x - man.x;
            const dy = bot.y - man.y;
            return dx * dx + dy * dy > 64 ? man : corner;
        }
        default:
            return man;
    }
}

/** ChatMan meets a spam bot: on the same tile, or passing each other this tick */
function catchUp(board: Board, manWas: number, botsWere: number[]): void {
    const man = nearest(board.man);
    board.bots.forEach((bot, i) => {
        if (board.pause > 0 || bot.mode === HOME) return;
        const at = nearest(bot);
        if (at !== man && !(at === manWas && botsWere[i] === man)) return;
        if (bot.frightened) {
            board.score += BOT_POINTS << board.eaten;
            board.eaten = Math.min(board.eaten + 1, 3);
            // Back to the pen, to wait and leave again
            Object.assign(bot, { ...PEN_TILES[0], d: UP, p: 0, mode: HOME, wait: EATEN_TICKS, frightened: false });
            return;
        }
        board.lives--;
        board.pause = CAUGHT_TICKS;
        board.after = CAUGHT;
    });
}

/** The board's next number from its seeded source (mulberry32, as `maze.ts`'s `seeded`) */
function random(board: Board): number {
    board.rng = (board.rng + 0x6d2b79f5) >>> 0;
    let t = board.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
}

/**
 * A board as the shared state carries it: its numbers, then what's left of the food as hex, a bit
 * for each of the maze's food tiles in order, then ChatMan and the spam bots as arrays
 */
export type PackedBoard = {
    t: number;
    n: number;
    level: number;
    score: number;
    lives: number;
    out: boolean;
    clock: number;
    pause: number;
    after: number;
    fright: number;
    eaten: number;
    rng: number;
    left: number;
    food: string;
    /** x, y, the way he faces, how far on, the way he's turned, and 1 if he's moving */
    man: [number, number, Dir, number, Dir, number];
    /** x, y, the way it faces, how far on, its mode, its wait, and 1 if it's frightened */
    bots: [number, number, Dir, number, Mode, number, number][];
};

export function pack(board: Board, maze: ChatMaze): PackedBoard {
    let food = "";
    for (let k = 0; k < maze.foodTiles.length; k += 4) {
        let nibble = 0;
        for (let j = 0; j < 4 && k + j < maze.foodTiles.length; j++) {
            if (board.food[maze.foodTiles[k + j]] !== 0) nibble |= 1 << j;
        }
        food += nibble.toString(16);
    }
    const { man } = board;
    return {
        t: board.t,
        n: board.n,
        level: board.level,
        score: board.score,
        lives: board.lives,
        out: board.out,
        clock: board.clock,
        pause: board.pause,
        after: board.after,
        fright: board.fright,
        eaten: board.eaten,
        rng: board.rng,
        left: board.left,
        food,
        man: [man.x, man.y, man.d, man.p, man.w, man.moving ? 1 : 0],
        bots: board.bots.map((b) => [b.x, b.y, b.d, b.p, b.mode, b.wait, b.frightened ? 1 : 0]),
    };
}

/** A board from its packed form, with the maze of its level */
export function unpack(packed: PackedBoard, maze: ChatMaze): Board {
    const food = new Uint8Array(maze.food.length);
    maze.foodTiles.forEach((tile, k) => {
        const nibble = parseInt(packed.food[k >> 2] ?? "0", 16);
        if ((nibble & (1 << (k & 3))) !== 0) food[tile] = maze.food[tile];
    });
    const [x, y, d, p, w, moving] = packed.man;
    return {
        t: packed.t,
        n: packed.n,
        level: packed.level,
        score: packed.score,
        lives: packed.lives,
        out: packed.out,
        clock: packed.clock,
        pause: packed.pause,
        after: packed.after,
        fright: packed.fright,
        eaten: packed.eaten,
        rng: packed.rng,
        left: packed.left,
        food,
        man: { x, y, d, p, w, moving: moving === 1 },
        bots: packed.bots.map(([x, y, d, p, mode, wait, frightened]) => ({
            x,
            y,
            d,
            p,
            mode,
            wait,
            frightened: frightened === 1,
        })),
    };
}

/** A board to play on without touching this one, eg. the page's guess at where a player is now */
export function copy(board: Board): Board {
    return {
        ...board,
        food: board.food.slice(),
        man: { ...board.man },
        bots: board.bots.map((b) => ({ ...b })),
    };
}

/** Whether ChatMan has just been caught, for the page to draw it: the pause before a restart */
export function isCaught(board: Board): boolean {
    return board.pause > 0 && board.after === CAUGHT;
}

/** Whether the level's just been cleared: the pause before the next */
export function isCleared(board: Board): boolean {
    return board.pause > 0 && board.after === CLEARED;
}
