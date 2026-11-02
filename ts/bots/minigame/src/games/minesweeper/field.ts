// A minefield, from a seed, that can be cleared by logic alone: no cell ever has to be guessed.
// The mines are laid at random, clear of a starting cell and its neighbours, and the field is kept
// only if a solver working from that start, by the rules a player uses, opens every safe cell;
// otherwise it's laid again. The solver's rules: a number with as many mines found round it as it
// says has the rest of its neighbours safe; one with as many hidden neighbours as mines still to
// find has them all mines; two numbers whose hidden neighbours overlap can settle the cells only
// one of them touches; and the mines left to find can settle the rest. Built from scratch.
import { seeded } from "../maze/maze";

export type Field = {
    /** Cells along each side */
    size: number;
    /** Whether each cell is a mine, by row from the top, then column */
    mine: Uint8Array;
    /** How many mines each cell touches */
    count: Uint8Array;
    /** The cell everyone starts with open, which touches no mine */
    start: number;
    mines: number;
};

/** How many fields are laid looking for one that needs no guess, before the last is taken anyway */
const MAX_ATTEMPTS = 2000;

/** The cells next to a cell, across and diagonally */
export function neighbours(size: number, cell: number): number[] {
    const x = cell % size;
    const y = Math.floor(cell / size);
    const around: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < size && ny < size) around.push(ny * size + nx);
        }
    }
    return around;
}

/** A field from its mines' cells and its start, as the store keeps it */
export function fieldOf(size: number, mineCells: readonly number[], start: number): Field {
    const mine = new Uint8Array(size * size);
    for (const cell of mineCells) mine[cell] = 1;
    const count = new Uint8Array(size * size);
    for (let cell = 0; cell < size * size; cell++) {
        for (const n of neighbours(size, cell)) count[cell] += mine[n];
    }
    return { size, mine, count, start, mines: mineCells.length };
}

/** The mines' cells, in order */
export function mineCells(field: Field): number[] {
    const cells: number[] = [];
    field.mine.forEach((m, cell) => {
        if (m === 1) cells.push(cell);
    });
    return cells;
}

/**
 * A field `size` cells each way with `mines` mines that can be cleared without a guess from its
 * start, laid from a seed. Integer arithmetic only, so a seed lays the same field anywhere.
 */
export function lay(size: number, mines: number, seed: number): Field {
    const next = seeded(seed);
    let field: Field | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        field = layOnce(size, mines, next);
        if (solves(field)) return field;
    }
    console.warn(
        `No field ${size} by ${size} with ${mines} mines could be cleared without a guess in ${MAX_ATTEMPTS} tries`,
    );
    return field!;
}

// Mines at random, clear of a start away from the edges, so it opens up more than a corner would
function layOnce(size: number, mines: number, next: () => number): Field {
    const inner = size - 2;
    const start = (1 + (next() % inner)) * size + (1 + (next() % inner));
    const clear = new Set([start, ...neighbours(size, start)]);
    const cells: number[] = [];
    for (let cell = 0; cell < size * size; cell++) if (!clear.has(cell)) cells.push(cell);
    // The first `mines` of a shuffle
    for (let i = 0; i < mines; i++) {
        const j = i + (next() % (cells.length - i));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return fieldOf(size, cells.slice(0, mines), start);
}

const HIDDEN = 0;
const SAFE = 1;
const MINE = 2;

/** Whether the solver clears the field from its start, without a guess */
export function solves(field: Field): boolean {
    const { size, count } = field;
    const cells = size * size;
    const known = new Uint8Array(cells);
    let opened = 0;
    let found = 0;
    const safeCells = cells - field.mines;

    const open = (from: number) => {
        const stack = [from];
        while (stack.length > 0) {
            const cell = stack.pop()!;
            if (known[cell] !== HIDDEN) continue;
            known[cell] = SAFE;
            opened++;
            if (count[cell] === 0) stack.push(...neighbours(size, cell));
        }
    };
    const flag = (cell: number) => {
        if (known[cell] !== HIDDEN) return;
        known[cell] = MINE;
        found++;
    };

    // A number's hidden neighbours, and how many of them are mines
    type Clue = { hidden: number[]; need: number };
    const clue = (cell: number): Clue | undefined => {
        if (known[cell] !== SAFE || count[cell] === 0) return undefined;
        const hidden: number[] = [];
        let flagged = 0;
        for (const n of neighbours(size, cell)) {
            if (known[n] === HIDDEN) hidden.push(n);
            else if (known[n] === MINE) flagged++;
        }
        return hidden.length === 0 ? undefined : { hidden, need: count[cell] - flagged };
    };

    open(field.start);
    while (opened < safeCells) {
        let progress = false;

        // A number on its own
        for (let cell = 0; cell < cells; cell++) {
            const c = clue(cell);
            if (c === undefined) continue;
            if (c.need === 0) {
                c.hidden.forEach(open);
                progress = true;
            } else if (c.need === c.hidden.length) {
                c.hidden.forEach(flag);
                progress = true;
            }
        }
        if (progress) continue;

        // Two numbers near each other: if b needs as many more mines than a as it has cells a
        // doesn't touch, those are all mines, and a's cells that b doesn't touch are all safe
        const clues = new Map<number, Clue>();
        for (let cell = 0; cell < cells; cell++) {
            const c = clue(cell);
            if (c !== undefined) clues.set(cell, c);
        }
        for (const [a, ca] of clues) {
            const ax = a % size;
            const ay = Math.floor(a / size);
            for (let dy = -2; dy <= 2 && !progress; dy++) {
                for (let dx = -2; dx <= 2 && !progress; dx++) {
                    const bx = ax + dx;
                    const by = ay + dy;
                    if ((dx === 0 && dy === 0) || bx < 0 || by < 0 || bx >= size || by >= size) {
                        continue;
                    }
                    const cb = clues.get(by * size + bx);
                    if (cb === undefined) continue;
                    const onlyB = cb.hidden.filter((n) => !ca.hidden.includes(n));
                    if (onlyB.length === cb.hidden.length) continue;
                    if (cb.need - ca.need !== onlyB.length) continue;
                    const onlyA = ca.hidden.filter((n) => !cb.hidden.includes(n));
                    if (onlyA.length === 0 && onlyB.length === 0) continue;
                    onlyB.forEach(flag);
                    onlyA.forEach(open);
                    progress = true;
                }
            }
            if (progress) break;
        }
        if (progress) continue;

        // With every mine found, whatever's hidden is safe; otherwise it would take a guess
        if (found < field.mines) return false;
        for (let cell = 0; cell < cells; cell++) open(cell);
    }
    return true;
}
