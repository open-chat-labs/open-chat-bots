// Hex, as Piet Hein came to it in 1942, and John Nash in 1948: a rhombus of hexagons, n cells a
// side. The players take turns putting a stone on an empty cell. The first to move tries to join the
// top and bottom edges with a chain of their stones, the second the left and right edges, and one of
// them always does, as the board fills: there's no draw. Moving first is a big advantage, so once
// the first stone is down, the second player may swap instead of putting one down: the first stone
// becomes theirs, reflected onto their own edges, and the first player moves again. Built here from
// scratch.
//
// The cells are by row from the top, then column, each row set half a cell further right than the
// one above, so a cell's neighbours are the two beside it, the two above, up and up-right, and the
// two below, down-left and down.
import type { Position, Seat } from "../duel/types";

/** The second player's swap, written as a move */
export const SWAP = "swap";

const COLUMNS = "abcdefghijklmnopqrs";

/** The most cells a side, as a cell's name has a letter for its column */
export const MAX_SIZE = COLUMNS.length;

/** A cell's name, as Hex writes it: its column from a, then its row from 1 at the top */
export function cellName(size: number, index: number): string {
    return COLUMNS[index % size] + (Math.floor(index / size) + 1);
}

/** The index of the cell a name gives, by row from the top, then column, or undefined */
export function cellIndex(size: number, name: string): number | undefined {
    const parts = /^([a-s])([1-9][0-9]?)$/.exec(name);
    if (parts === null) return undefined;
    const column = COLUMNS.indexOf(parts[1]);
    const row = Number(parts[2]) - 1;
    if (column >= size || row >= size) return undefined;
    return row * size + column;
}

/** The cells next to a cell */
export function neighbours(size: number, index: number): number[] {
    const row = Math.floor(index / size);
    const column = index % size;
    const around: number[] = [];
    for (const [dr, dc] of [
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
    ]) {
        const r = row + dr;
        const c = column + dc;
        if (r >= 0 && r < size && c >= 0 && c < size) around.push(r * size + c);
    }
    return around;
}

export class HexBoard implements Position<string> {
    readonly size: number;
    readonly #cells: (Seat | null)[];
    #turn: Seat = 0;
    #moves = 0;
    #outcome?: { winner: Seat };
    #last?: number;
    #swapped = false;
    #chain: number[] = [];

    constructor(size: number) {
        if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE) {
            throw new Error(`A board is 2 to ${MAX_SIZE} cells a side`);
        }
        this.size = size;
        this.#cells = new Array(size * size).fill(null);
    }

    /**
     * A board from a picture of it, a row for each of its rows from the top, unshifted: "X" for the
     * first player's stones, seat 0, "O" for the second's, seat 1, and "." for empty. For a test of a
     * position play doesn't reach quickly; the side to move is whoever has fewer stones.
     */
    static from(picture: readonly string[]): HexBoard {
        const board = new HexBoard(picture.length);
        const cells = picture.join("");
        if (cells.length !== board.size * board.size || !/^[XO.]*$/.test(cells)) {
            throw new Error("A board is n rows of n of X, O or .");
        }
        [...cells].forEach((ch, i) => {
            board.#cells[i] = ch === "X" ? 0 : ch === "O" ? 1 : null;
        });
        board.#moves = [...cells].filter((ch) => ch !== ".").length;
        board.#turn = board.count(0) > board.count(1) ? 1 : 0;
        return board;
    }

    get turn(): Seat {
        return this.#turn;
    }

    get outcome(): { winner: Seat } | undefined {
        return this.#outcome;
    }

    /** The cell of the last stone put down, the swapped one included */
    get last(): number | undefined {
        return this.#last;
    }

    /** Whether the second player swapped */
    get swapped(): boolean {
        return this.#swapped;
    }

    /** The winner's stones that join their edges, once someone's won */
    get chain(): readonly number[] {
        return this.#chain;
    }

    /** Whose stone is on the cell, by index, if anyone's */
    at(index: number): Seat | null {
        return this.#cells[index];
    }

    count(seat: Seat): number {
        return this.#cells.filter((cell) => cell === seat).length;
    }

    /** Whether the second player can swap: only instead of their first stone */
    canSwap(): boolean {
        return this.#outcome === undefined && this.#moves === 1;
    }

    legalMoves(): string[] {
        if (this.#outcome !== undefined) return [];
        const moves: string[] = [];
        this.#cells.forEach((cell, i) => {
            if (cell === null) moves.push(cellName(this.size, i));
        });
        if (this.canSwap()) moves.push(SWAP);
        return moves;
    }

    /** Puts the side to move's stone on the cell, by name, eg. "e5", or swaps */
    play(move: string): string | undefined {
        if (this.#outcome !== undefined) return "The game has finished";
        if (move === SWAP) return this.#swap();
        const index = cellIndex(this.size, move);
        if (index === undefined) return "That isn't a cell";
        if (this.#cells[index] !== null) return "That cell's taken";
        const seat = this.#turn;
        this.#cells[index] = seat;
        this.#last = index;
        this.#moves++;
        const chain = this.#joining(index, seat);
        if (chain !== undefined) {
            this.#outcome = { winner: seat };
            this.#chain = chain;
        } else {
            this.#turn = seat === 0 ? 1 : 0;
        }
        return undefined;
    }

    // The first stone becomes the second player's, reflected across the long diagonal so that it
    // stands as well for joining their edges as it did for the first player's
    #swap(): string | undefined {
        if (!this.canSwap()) return "You can only swap instead of your first stone";
        const first = this.#cells.indexOf(0);
        const row = Math.floor(first / this.size);
        const column = first % this.size;
        const reflected = column * this.size + row;
        this.#cells[first] = null;
        this.#cells[reflected] = 1;
        this.#last = reflected;
        this.#swapped = true;
        this.#moves++;
        this.#turn = 0;
        return undefined;
    }

    // The stones joined to the one just put down, if they reach both of the seat's edges: the top
    // and bottom for the first player, the left and right for the second
    #joining(from: number, seat: Seat): number[] | undefined {
        const n = this.size;
        const edge = (index: number) => (seat === 0 ? Math.floor(index / n) : index % n);
        const group = [from];
        const seen = new Set(group);
        let start = false;
        let end = false;
        for (let head = 0; head < group.length; head++) {
            const cell = group[head];
            if (edge(cell) === 0) start = true;
            if (edge(cell) === n - 1) end = true;
            for (const next of neighbours(n, cell)) {
                if (this.#cells[next] === seat && !seen.has(next)) {
                    seen.add(next);
                    group.push(next);
                }
            }
        }
        return start && end ? group : undefined;
    }
}
