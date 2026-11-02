import { describe, expect, it } from "vitest";
import { seeded } from "../maze/maze";
import { chatMaze, DOT, DOWN, LEFT, PEN_TILES, RIGHT, START, UP, WIDTH, type Dir } from "./maze";
import {
    BOT_POINTS,
    CAUGHT_TICKS,
    CLEARED_TICKS,
    copy,
    DOT_POINTS,
    frightTicks,
    HOME,
    isCaught,
    isCleared,
    LEAVING,
    Mazes,
    newBoard,
    pack,
    PELLET_POINTS,
    play,
    ROAMING,
    unpack,
    type Board,
    type Turn,
} from "./rules";

// Seed 12345's first maze, around ChatMan's start at (9, 15):
//
//   row 13  #.................#
//   row 14  #.#.#.###.###.#.#.#
//   row 15  #.#...#..C..#...#.#
//   row 16  #.#.###.###.###.#.#
//
// Left of him, (7, 15) is a corner: the wall's beyond it, and the way on is down
const SEED = 12345;

function board(lives = 3): { board: Board; mazes: Mazes } {
    return { board: newBoard(SEED, lives), mazes: new Mazes(SEED) };
}

const turnAt = (t: number, d: Dir, n = 1): Turn => ({ n, t, d });

/** A spam bot out in the maze, at (x, y), going `d` */
function roaming(b: Board, i: number, x: number, y: number, d: Dir, frightened = false) {
    Object.assign(b.bots[i], { x, y, d, p: 0, mode: ROAMING, wait: 0, frightened });
}

describe("a ChatMan board", () => {
    it("starts with every dot, and ChatMan at the start heading left", () => {
        const { board: b } = board();
        expect(b).toMatchObject({ t: 0, level: 1, score: 0, lives: 3, out: false });
        expect(b.left).toBe(chatMaze(SEED, 1).foodTiles.length);
        expect(b.man).toEqual({ ...START, d: LEFT, p: 0, w: LEFT, moving: true });
        expect(b.bots.map((bot) => bot.mode)).toEqual([HOME, HOME, HOME, HOME]);
    });

    it("runs ChatMan until a wall, a tile every three ticks, eating the dots on the way", () => {
        const { board: b, mazes } = board();
        play(b, mazes, [], 2);
        // Half way to the next tile, he's eaten its dot
        expect(b.score).toBe(DOT_POINTS);
        play(b, mazes, [], 10);
        expect(b.man).toMatchObject({ x: 7, y: 15, moving: false });
        expect(b.score).toBe(2 * DOT_POINTS);
        expect(b.food[15 * WIDTH + 7]).toBe(0);
        expect(b.food[15 * WIDTH + 6]).toBe(0);
    });

    it("takes a turn at the first junction that allows it", () => {
        const { board: b, mazes } = board();
        // Down's walled until the corner at (7, 15)
        play(b, mazes, [turnAt(0, DOWN)], 6);
        expect(b.man).toMatchObject({ x: 7, y: 15, d: DOWN, moving: true });
        play(b, mazes, [], 9);
        expect(b.man).toMatchObject({ x: 7, y: 16, d: DOWN });
    });

    it("turns back the way he came at once, from between two tiles", () => {
        const { board: b, mazes } = board();
        play(b, mazes, [turnAt(2, RIGHT)], 4);
        expect(b.man).toMatchObject({ x: 9, y: 15, d: RIGHT, p: 0, moving: true });
    });

    it("still takes a turn just after the junction it was for", () => {
        const { board: b, mazes } = board();
        // A third of the way left, up from the start is still taken
        play(b, mazes, [turnAt(1, UP)], 2);
        expect(b.man).toMatchObject({ x: 9, y: 15, d: UP, p: 8 });
    });

    it("lets the spam bots out of the pen one by one, three seconds apart", () => {
        const { board: b, mazes } = board();
        play(b, mazes, [], 1);
        expect(b.bots.map((bot) => bot.mode)).toEqual([LEAVING, HOME, HOME, HOME]);
        play(b, mazes, [], 61);
        expect(b.bots.map((bot) => bot.mode)).toEqual([ROAMING, LEAVING, HOME, HOME]);
        play(b, mazes, [], 181);
        expect(b.bots.map((bot) => bot.mode)).toEqual([ROAMING, ROAMING, ROAMING, LEAVING]);
    });

    it("costs a life when a spam bot catches him, then starts again with the dots left", () => {
        const { board: b, mazes } = board();
        // Coming the other way along his row: they pass each other on the second tick
        roaming(b, 0, 8, 15, RIGHT);
        play(b, mazes, [], 2);
        expect(b.lives).toBe(2);
        expect(isCaught(b)).toBe(true);
        expect(b.score).toBe(DOT_POINTS);
        play(b, mazes, [], 2 + CAUGHT_TICKS);
        expect(isCaught(b)).toBe(false);
        expect(b.man).toEqual({ ...START, d: LEFT, p: 0, w: LEFT, moving: true });
        expect(b.bots.map(({ x, y, mode }) => ({ x, y, mode }))).toEqual(
            PEN_TILES.map((tile) => ({ ...tile, mode: HOME })),
        );
        // The dot he ate stays eaten
        expect(b.food[15 * WIDTH + 8]).toBe(0);
    });

    it("is out once the last life's gone, and nothing more happens", () => {
        const { board: b, mazes } = board(1);
        roaming(b, 0, 8, 15, RIGHT);
        play(b, mazes, [], 2 + CAUGHT_TICKS);
        expect(b).toMatchObject({ lives: 0, out: true });
        const before = copy(b);
        play(b, mazes, [turnAt(40, UP, 2)], 100);
        expect(b.man).toMatchObject({ x: before.man.x, y: before.man.y, p: before.man.p });
        expect(b.bots).toEqual(before.bots);
        expect(b.score).toBe(before.score);
        // The turn's taken, for what it's worth, so the bot can let it go
        expect(b).toMatchObject({ t: 100, n: 2 });
    });

    it("frightens the spam bots out of the pen with a power pellet", () => {
        const { board: b, mazes } = board();
        // Below the top-left pellet at (1, 3), heading up to it, his own tile's dot eaten
        Object.assign(b.man, { x: 1, y: 4, d: UP, w: UP, p: 0, moving: true });
        b.food[4 * WIDTH + 1] = 0;
        play(b, mazes, [], 2);
        expect(b.score).toBe(PELLET_POINTS);
        expect(b.fright).toBe(frightTicks(1));
        // The one leaving the pen is frightened; those waiting aren't
        expect(b.bots.map((bot) => bot.frightened)).toEqual([true, false, false, false]);
        // Kept in the pen, so none that isn't frightened catches him meanwhile
        for (const bot of b.bots.slice(1)) bot.wait = 1000;
        play(b, mazes, [], 1 + frightTicks(1));
        expect(b.bots[0].frightened).toBe(true);
        play(b, mazes, [], 2 + frightTicks(1));
        expect(b.bots.some((bot) => bot.frightened)).toBe(false);
    });

    it("eats frightened spam bots, each worth double the last, and sends them home", () => {
        const { board: b, mazes } = board();
        b.fright = 100;
        roaming(b, 0, 8, 15, RIGHT, true);
        roaming(b, 1, 7, 15, RIGHT, true);
        play(b, mazes, [], 2);
        expect(b.score).toBe(DOT_POINTS + BOT_POINTS);
        expect(b.bots[0]).toMatchObject({ ...PEN_TILES[0], mode: HOME, frightened: false });
        play(b, mazes, [], 4);
        expect(b.score).toBe(DOT_POINTS + BOT_POINTS + 2 * BOT_POINTS);
        expect(b.lives).toBe(3);
    });

    it("goes on to the next level's maze once every dot's eaten", () => {
        const { board: b, mazes } = board();
        b.food.fill(0);
        b.food[15 * WIDTH + 8] = DOT;
        b.left = 1;
        play(b, mazes, [], 2);
        expect(isCleared(b)).toBe(true);
        play(b, mazes, [], 2 + CLEARED_TICKS);
        const next = chatMaze(SEED, 2);
        expect(b.level).toBe(2);
        expect(b.left).toBe(next.foodTiles.length);
        expect([...b.food]).toEqual([...next.food]);
        expect(b.man).toMatchObject({ ...START, d: LEFT });
    });

    it("plays the same from the same turns, as the bot and the page both play it", () => {
        // A turn every 4 to 15 ticks, for a minute
        const rnd = seeded(7);
        const turns: Turn[] = [];
        for (let t = 0, n = 1; t < 1200; t += 4 + (rnd() % 12)) {
            turns.push({ n: n++, t, d: (rnd() % 4) as Dir });
        }
        const { board: b, mazes } = board();
        // Played in one go, or a bit at a time, as the bot does
        play(b, mazes, turns, 1200);
        const { board: c } = board();
        let rest = turns;
        for (let to = 37; to < 1200; to += 37) rest = play(c, mazes, rest, to);
        play(c, mazes, rest, 1200);
        expect(c).toEqual(b);
        expect(b).toMatchObject({ t: 1200, n: 126, score: 730, lives: 0, out: true, left: 119 });
        expect(b.rng).toBe(652878946);
    });

    it("packs into the shared state and back unchanged", () => {
        const { board: b, mazes } = board();
        play(b, mazes, [turnAt(0, DOWN), turnAt(30, RIGHT, 2)], 300);
        const maze = mazes.level(b.level);
        const packed = JSON.parse(JSON.stringify(pack(b, maze)));
        expect(unpack(packed, maze)).toEqual(b);
        expect(JSON.stringify(packed).length).toBeLessThan(400);
    });
});
