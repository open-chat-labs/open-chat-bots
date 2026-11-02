// Four in a Row's rules: a grid seven columns wide and six high, standing up, into which the two
// players take turns dropping a disc. A disc falls to the lowest free cell in its column. Four of a
// player's discs in a line, across, up or on a diagonal, win; a full grid with no line is a draw.
// Played on paper and in wood for well over a century, and built here from scratch.
import type { Position, Seat } from "../duel/types";

export const COLUMNS = 7;
export const ROWS = 6;
/** How many in a line win */
export const LINE = 4;

/** A cell's index: by row from the bottom, then by column */
export function cellIndex(column: number, row: number): number {
    return row * COLUMNS + column;
}

const DIRECTIONS: readonly [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
];

export class Grid implements Position<number> {
    readonly #cells: (Seat | null)[] = new Array(COLUMNS * ROWS).fill(null);
    readonly #heights: number[] = new Array(COLUMNS).fill(0);
    #turn: Seat = 0;
    #discs = 0;
    #outcome?: { winner: Seat | null };
    #line?: number[];

    get turn(): Seat {
        return this.#turn;
    }

    get outcome(): { winner: Seat | null } | undefined {
        return this.#outcome;
    }

    /** The winning line's cells, once there is one: four or more, in order along it */
    get line(): readonly number[] | undefined {
        return this.#line;
    }

    /** Whose disc is in the cell, if anyone's */
    at(column: number, row: number): Seat | null {
        return this.#cells[cellIndex(column, row)];
    }

    /** How many discs the column holds, which is the row the next one lands in */
    height(column: number): number {
        return this.#heights[column];
    }

    legalMoves(): number[] {
        if (this.#outcome !== undefined) return [];
        const moves: number[] = [];
        for (let column = 0; column < COLUMNS; column++) {
            if (this.#heights[column] < ROWS) moves.push(column);
        }
        return moves;
    }

    /** Drops the side to move's disc into the column, numbered from 0 on the left */
    play(column: number): string | undefined {
        if (this.#outcome !== undefined) return "The game has finished";
        if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) {
            return "That isn't a column";
        }
        const row = this.#heights[column];
        if (row >= ROWS) return "That column's full";
        const seat = this.#turn;
        this.#cells[cellIndex(column, row)] = seat;
        this.#heights[column]++;
        this.#discs++;
        const line = this.#lineThrough(column, row, seat);
        if (line !== undefined) {
            this.#outcome = { winner: seat };
            this.#line = line;
        } else if (this.#discs === COLUMNS * ROWS) {
            this.#outcome = { winner: null };
        } else {
            this.#turn = seat === 0 ? 1 : 0;
        }
        return undefined;
    }

    // The longest line of the seat's discs through the cell, if it's long enough to win
    #lineThrough(column: number, row: number, seat: Seat): number[] | undefined {
        let best: number[] | undefined;
        for (const [dc, dr] of DIRECTIONS) {
            const cells = [cellIndex(column, row)];
            for (const sign of [1, -1]) {
                let c = column + dc * sign;
                let r = row + dr * sign;
                while (c >= 0 && c < COLUMNS && r >= 0 && r < ROWS && this.at(c, r) === seat) {
                    if (sign === 1) cells.push(cellIndex(c, r));
                    else cells.unshift(cellIndex(c, r));
                    c += dc * sign;
                    r += dr * sign;
                }
            }
            if (cells.length >= LINE && cells.length > (best?.length ?? 0)) best = cells;
        }
        return best;
    }
}
