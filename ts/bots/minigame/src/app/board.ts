// A board drawn as tiles that slide, merge and appear, as in Gabriele Cirulli's 2048
// (https://github.com/gabrielecirulli/2048, MIT), whose way of animating this follows: each tile
// is positioned on its own and slid by a CSS transition; the two tiles of a pair slide to the
// same cell, where the merged tile pops up over them; a new tile appears with a pop of its own.
//
// The view is given boards, not moves: a board with a direction is animated as a slide when
// that's how the board got there, allowing for the tile spawned after it, which is how both the
// player's own moves and the moves others make, replayed from the shared state, are drawn. Any
// other change is drawn as it is.
import { CELLS, SIZE, emptyBoard, slideMoves, type Board, type Direction } from "../games/race2048/engine";

/** How long a slide takes, after which the merged tiles pop and the sources go */
const SLIDE_MS = 100;

type Tile = {
    el: HTMLElement;
    inner: HTMLElement;
    value: number;
    cell: number;
    /** Slid into a merge: goes once the slide is done */
    merging: boolean;
};

export class BoardView {
    readonly el: HTMLElement;
    #tiles: Tile[] = [];
    /** The board as drawn, once any slide in progress is done */
    #board: Board = emptyBoard();
    #timer: ReturnType<typeof setTimeout> | undefined;

    constructor(board: Board) {
        this.el = document.createElement("div");
        this.el.className = "board";
        for (let cell = 0; cell < CELLS; cell++) {
            const empty = document.createElement("div");
            empty.className = "cell";
            place(empty, cell);
            this.el.append(empty);
        }
        this.update(board);
    }

    /**
     * Shows `board`. With a direction, the tiles slide there from where they are when the board is
     * the one that slide makes, with or without a tile spawned after it; otherwise each cell is
     * drawn as it is now, a tile appearing where one wasn't.
     */
    update(board: Board, direction?: Direction): void {
        this.#settle();
        if (direction !== undefined && this.#slide(board, direction)) return;
        this.#draw(board);
    }

    /** Ends a slide in progress: the tiles merged into are gone */
    #settle(): void {
        if (this.#timer === undefined) return;
        clearTimeout(this.#timer);
        this.#timer = undefined;
        this.#dropMerged();
    }

    #dropMerged(): void {
        for (const tile of this.#tiles) {
            if (tile.merging) tile.el.remove();
        }
        this.#tiles = this.#tiles.filter((tile) => !tile.merging);
    }

    #slide(board: Board, direction: Direction): boolean {
        const result = slideMoves(this.#board, direction);
        if (!result.moved) return false;
        // The board is the slide's, with at most a tile spawned where the slide left a cell empty
        let spawned = -1;
        for (let cell = 0; cell < CELLS; cell++) {
            if (board[cell] === result.board[cell]) continue;
            const spawn = result.board[cell] === 0 && (board[cell] === 2 || board[cell] === 4);
            if (!spawn || spawned !== -1) return false;
            spawned = cell;
        }
        const merges = new Set<number>();
        for (const move of result.moves) {
            const tile = this.#tiles.find((t) => t.cell === move.from && !t.merging);
            if (tile === undefined) return false;
            tile.cell = move.to;
            tile.merging = move.merged;
            place(tile.el, move.to);
            if (move.merged) merges.add(move.to);
        }
        // The merged and spawned tiles are there from the start, popping up once the slide is done
        for (const cell of merges) {
            this.#add(cell, result.board[cell], "merged");
        }
        if (spawned !== -1) {
            this.#add(spawned, board[spawned], "new", SLIDE_MS);
        }
        this.#board = board.slice();
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            this.#dropMerged();
        }, SLIDE_MS);
        return true;
    }

    #draw(board: Board): void {
        for (let cell = 0; cell < CELLS; cell++) {
            const value = board[cell];
            const tile = this.#tiles.find((t) => t.cell === cell);
            if (value === 0) {
                if (tile !== undefined) {
                    tile.el.remove();
                    this.#tiles = this.#tiles.filter((t) => t !== tile);
                }
            } else if (tile === undefined) {
                this.#add(cell, value, "new");
            } else if (tile.value !== value) {
                tile.value = value;
                dress(tile.inner, value);
            }
        }
        this.#board = board.slice();
    }

    #add(cell: number, value: number, kind: "new" | "merged", delayMs = 0): void {
        const el = document.createElement("div");
        el.className = `tile tile-${kind}`;
        place(el, cell);
        const inner = document.createElement("div");
        inner.className = "tile-inner";
        if (delayMs > 0) {
            inner.style.animationDelay = `${delayMs}ms`;
            inner.style.animationFillMode = "backwards";
        }
        dress(inner, value);
        el.append(inner);
        this.el.append(el);
        this.#tiles.push({ el, inner, value, cell, merging: false });
    }
}

function place(el: HTMLElement, cell: number): void {
    el.style.setProperty("--x", String(cell % SIZE));
    el.style.setProperty("--y", String(Math.floor(cell / SIZE)));
}

function dress(inner: HTMLElement, value: number): void {
    inner.className = `tile-inner t-${value > 2048 ? "big" : value}`;
    inner.textContent = String(value);
}
