// Reversi's rules, as published in the 1880s and played since: an eight by eight board starting with
// two discs each in the middle, crossed. Black moves first. A move puts a disc of the mover's colour
// on an empty square so that it and another of theirs flank one or more of the opponent's in a
// straight line, across, up or down, or on a diagonal; every disc flanked is flipped. A player with
// no move passes, and the game ends when neither can move, usually with the board full: the one
// with more discs wins. Built here from scratch.
import type { Position, Seat } from "../duel/types";

export const SIZE = 8;
const FILES = "abcdefgh";

/** A square's name, as Reversi writes it: its column a to h, then its row 1 to 8 from the top */
export function squareName(index: number): string {
    return FILES[index % SIZE] + (Math.floor(index / SIZE) + 1);
}

/** The index of the square a name gives, by row from the top, then column, or undefined */
export function squareIndex(name: string): number | undefined {
    const parts = /^([a-h])([1-8])$/.exec(name);
    if (parts === null) return undefined;
    return (Number(parts[2]) - 1) * SIZE + FILES.indexOf(parts[1]);
}

const DIRECTIONS: readonly [number, number][] = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
];

export class Board implements Position<string> {
    readonly #cells: (Seat | null)[] = new Array(SIZE * SIZE).fill(null);
    #turn: Seat = 0;
    #outcome?: { winner: Seat | null };
    #passed?: Seat;
    #last?: number;
    #flipped: number[] = [];

    constructor() {
        // Seat 0 is Black and seat 1 White: White on d4 and e5, Black on e4 and d5
        this.#cells[squareIndex("d4")!] = 1;
        this.#cells[squareIndex("e5")!] = 1;
        this.#cells[squareIndex("e4")!] = 0;
        this.#cells[squareIndex("d5")!] = 0;
    }

    /**
     * A board from a picture of it, a row of eight from the top for each of the eight rows: "B" for
     * Black, seat 0, "W" for White, seat 1, and "." for empty. For a test of a position play
     * doesn't reach quickly.
     */
    static from(picture: readonly string[], turn: Seat = 0): Board {
        const board = new Board();
        const cells = picture.join("");
        if (picture.length !== SIZE || !/^[BW.]{64}$/.test(cells)) {
            throw new Error("A board is eight rows of eight of B, W or .");
        }
        [...cells].forEach((ch, i) => {
            board.#cells[i] = ch === "B" ? 0 : ch === "W" ? 1 : null;
        });
        board.#turn = turn;
        return board;
    }

    get turn(): Seat {
        return this.#turn;
    }

    get outcome(): { winner: Seat | null } | undefined {
        return this.#outcome;
    }

    /** Who had no move, and passed, just before the side to move's turn, if anyone */
    get passed(): Seat | undefined {
        return this.#passed;
    }

    /** The square of the last disc put down, and the discs it flipped */
    get last(): number | undefined {
        return this.#last;
    }

    get flipped(): readonly number[] {
        return this.#flipped;
    }

    /** Whose disc is on the square, by index, if anyone's */
    at(index: number): Seat | null {
        return this.#cells[index];
    }

    /** How many discs the seat has on the board */
    count(seat: Seat): number {
        return this.#cells.filter((cell) => cell === seat).length;
    }

    legalMoves(): string[] {
        if (this.#outcome !== undefined) return [];
        return this.#movesFor(this.#turn).map(squareName);
    }

    /** Puts the side to move's disc on the square, by name, eg. "d3", flipping what it flanks */
    play(name: string): string | undefined {
        if (this.#outcome !== undefined) return "The game has finished";
        const index = squareIndex(name);
        if (index === undefined) return "That isn't a square";
        if (this.#cells[index] !== null) return "That square's taken";
        const seat = this.#turn;
        const flips = this.#flips(index, seat);
        if (flips.length === 0) return "A disc has to flip at least one of the other player's";
        this.#cells[index] = seat;
        for (const flip of flips) this.#cells[flip] = seat;
        this.#last = index;
        this.#flipped = flips;

        // The other player moves next if they can; if not, they pass; if neither can, it's over
        const next: Seat = seat === 0 ? 1 : 0;
        this.#passed = undefined;
        if (this.#movesFor(next).length > 0) {
            this.#turn = next;
        } else if (this.#movesFor(seat).length > 0) {
            this.#passed = next;
        } else {
            const mine = this.count(seat);
            const theirs = this.count(next);
            this.#outcome = { winner: mine === theirs ? null : mine > theirs ? seat : next };
        }
        return undefined;
    }

    #movesFor(seat: Seat): number[] {
        const moves: number[] = [];
        for (let index = 0; index < SIZE * SIZE; index++) {
            if (this.#cells[index] === null && this.#flips(index, seat).length > 0) {
                moves.push(index);
            }
        }
        return moves;
    }

    // The other player's discs a disc of the seat's on the square would flip
    #flips(index: number, seat: Seat): number[] {
        const row = Math.floor(index / SIZE);
        const column = index % SIZE;
        const flips: number[] = [];
        for (const [dr, dc] of DIRECTIONS) {
            const run: number[] = [];
            let r = row + dr;
            let c = column + dc;
            while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
                const cell = this.#cells[r * SIZE + c];
                if (cell === null) break;
                if (cell === seat) {
                    flips.push(...run);
                    break;
                }
                run.push(r * SIZE + c);
                r += dr;
                c += dc;
            }
        }
        return flips;
    }
}
