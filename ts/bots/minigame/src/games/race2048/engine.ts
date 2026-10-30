// The 2048 board: pure functions shared by the server, which decides every move, and the app,
// which applies a move before the server confirms it. Nothing here touches the game's rules for
// winning or restarting: see `race.ts`.

export const SIZE = 4;
export const CELLS = SIZE * SIZE;

/** A board as 16 cells, row by row from the top left: 0 for an empty cell, else the tile's value */
export type Board = number[];

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export function isDirection(value: unknown): value is Direction {
    return DIRECTIONS.includes(value as Direction);
}

export function emptyBoard(): Board {
    return new Array<number>(CELLS).fill(0);
}

/** A line of tiles slid towards its start, merging each pair of equal neighbours once */
function mergeLine(line: number[]): { line: number[]; gained: number } {
    const tiles = line.filter((v) => v !== 0);
    const merged: number[] = [];
    let gained = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
            merged.push(tiles[i] * 2);
            gained += tiles[i] * 2;
            i++;
        } else {
            merged.push(tiles[i]);
        }
    }
    while (merged.length < SIZE) {
        merged.push(0);
    }
    return { line: merged, gained };
}

/** The cells of each line, in the order tiles move: the first cell is where they slide to */
function lines(direction: Direction): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < SIZE; i++) {
        const cells: number[] = [];
        for (let j = 0; j < SIZE; j++) {
            switch (direction) {
                case "left":
                    cells.push(i * SIZE + j);
                    break;
                case "right":
                    cells.push(i * SIZE + (SIZE - 1 - j));
                    break;
                case "up":
                    cells.push(j * SIZE + i);
                    break;
                case "down":
                    cells.push((SIZE - 1 - j) * SIZE + i);
                    break;
            }
        }
        result.push(cells);
    }
    return result;
}

/**
 * Slides every tile as far as it goes in `direction`, merging pairs. `moved` is false when nothing
 * changed, which isn't a move: no tile is spawned for it.
 */
export function slide(
    board: Board,
    direction: Direction,
): { board: Board; gained: number; moved: boolean } {
    const next = board.slice();
    let gained = 0;
    let moved = false;
    for (const cells of lines(direction)) {
        const merged = mergeLine(cells.map((cell) => board[cell]));
        gained += merged.gained;
        cells.forEach((cell, j) => {
            if (next[cell] !== merged.line[j]) {
                next[cell] = merged.line[j];
                moved = true;
            }
        });
    }
    return { board: next, gained, moved };
}

/** A new tile in a random empty cell: a 2 nine times in ten, else a 4. A full board is left as is. */
export function spawn(board: Board, random: () => number = Math.random): Board {
    const empty: number[] = [];
    board.forEach((value, cell) => {
        if (value === 0) empty.push(cell);
    });
    if (empty.length === 0) return board;
    const next = board.slice();
    next[empty[Math.floor(random() * empty.length)]] = random() < 0.9 ? 2 : 4;
    return next;
}

/** A fresh board with two tiles */
export function newBoard(random: () => number = Math.random): Board {
    return spawn(spawn(emptyBoard(), random), random);
}

/** Whether any move would change the board */
export function canMove(board: Board): boolean {
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const value = board[row * SIZE + col];
            if (value === 0) return true;
            if (col + 1 < SIZE && board[row * SIZE + col + 1] === value) return true;
            if (row + 1 < SIZE && board[(row + 1) * SIZE + col] === value) return true;
        }
    }
    return false;
}

export function maxTile(board: Board): number {
    return board.reduce((max, value) => Math.max(max, value), 0);
}
