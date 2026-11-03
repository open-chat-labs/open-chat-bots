// A Crate Race level as it's played: 8 by 8 cells inside a ring of walls, with walls, goals, four
// crates and the player. The player steps up, down, left or right onto floor, and pushes a crate
// they step into if the cell beyond it is clear: they can't pull one, or push two. The level's
// solved when every crate's on a goal. The bot and the page share it: a racer's moves are a path,
// one letter a move, which both play from the level's start.

/** Cells along each side of a level's inside */
export const SIDE = 8;

/** A move: up, down, left or right */
export type Move = "u" | "d" | "l" | "r";

export const MOVES: readonly Move[] = ["u", "d", "l", "r"];

/** A level as `levels.ts` writes it, a character a cell, by row from the top */
export type LevelCode = string;

export type Level = {
    walls: readonly boolean[];
    goals: readonly boolean[];
    /** Where the crates start, in the level's order, which a crate keeps as it's pushed */
    crates: readonly number[];
    player: number;
};

/** A level from its code, or undefined if it isn't one */
export function readLevel(code: LevelCode): Level | undefined {
    if (code.length !== SIDE * SIDE || !/^[-#.$@]*$/.test(code)) return undefined;
    const cells = [...code];
    const player = cells.indexOf("@");
    const crates = cells.flatMap((c, i) => (c === "$" ? [i] : []));
    const goals = cells.map((c) => c === ".");
    if (player < 0 || cells.lastIndexOf("@") !== player || crates.length === 0) return undefined;
    if (goals.filter(Boolean).length !== crates.length) return undefined;
    return { walls: cells.map((c) => c === "#"), goals, crates, player };
}

/** The cell a move from a cell goes to, or undefined if it would leave the level */
export function next(cell: number, move: Move): number | undefined {
    const row = Math.floor(cell / SIDE);
    const column = cell % SIDE;
    switch (move) {
        case "u":
            return row > 0 ? cell - SIDE : undefined;
        case "d":
            return row < SIDE - 1 ? cell + SIDE : undefined;
        case "l":
            return column > 0 ? cell - 1 : undefined;
        case "r":
            return column < SIDE - 1 ? cell + 1 : undefined;
    }
}

export class Board {
    readonly level: Level;
    readonly #crates: number[];
    #player: number;
    #pushes = 0;

    constructor(level: Level) {
        this.level = level;
        this.#crates = [...level.crates];
        this.#player = level.player;
    }

    get player(): number {
        return this.#player;
    }

    /** Where each crate is, in the level's order */
    get crates(): readonly number[] {
        return this.#crates;
    }

    get pushes(): number {
        return this.#pushes;
    }

    /** Crates on goals */
    get placed(): number {
        return this.#crates.filter((c) => this.level.goals[c]).length;
    }

    get solved(): boolean {
        return this.placed === this.#crates.length;
    }

    crateAt(cell: number): number | undefined {
        const i = this.#crates.indexOf(cell);
        return i < 0 ? undefined : i;
    }

    /** Whether nothing's on the cell: no wall and no crate */
    isClear(cell: number | undefined): cell is number {
        return cell !== undefined && !this.level.walls[cell] && this.crateAt(cell) === undefined;
    }

    /** Makes a move, pushing a crate if there's one in the way: whether it could be made */
    move(move: Move): boolean {
        const to = next(this.#player, move);
        if (to === undefined || this.level.walls[to]) return false;
        const crate = this.crateAt(to);
        if (crate !== undefined) {
            const beyond = next(to, move);
            if (!this.isClear(beyond)) return false;
            this.#crates[crate] = beyond;
            this.#pushes++;
        }
        this.#player = to;
        return true;
    }

    /** The fewest moves that walk the player to a cell without pushing anything, if any do */
    walkTo(cell: number): Move[] | undefined {
        if (cell === this.#player) return [];
        if (!this.isClear(cell)) return undefined;
        const from = new Map<number, [number, Move]>();
        const queue = [this.#player];
        for (let head = 0; head < queue.length; head++) {
            const at = queue[head];
            for (const move of MOVES) {
                const to = next(at, move);
                if (!this.isClear(to) || to === this.#player || from.has(to)) continue;
                from.set(to, [at, move]);
                if (to === cell) {
                    const moves: Move[] = [];
                    for (let c = cell; c !== this.#player; c = from.get(c)![0]) {
                        moves.unshift(from.get(c)![1]);
                    }
                    return moves;
                }
                queue.push(to);
            }
        }
        return undefined;
    }
}

/** A path as a request may send it: moves, one letter each */
export function isPath(value: unknown, most: number): value is string {
    return typeof value === "string" && value.length <= most && /^[udlr]*$/.test(value);
}

/**
 * The level with a path played on it from the start, as far as its moves can be made: the board,
 * and how many of the path's moves it took
 */
export function play(level: Level, path: string): { board: Board; played: number } {
    const board = new Board(level);
    let played = 0;
    for (const move of path as Iterable<Move>) {
        if (!board.move(move)) break;
        played++;
    }
    return { board, played };
}
