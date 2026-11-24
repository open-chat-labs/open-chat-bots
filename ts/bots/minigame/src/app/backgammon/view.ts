// Backgammon's board, drawn as SVG from the viewer's side: their home board at the bottom right,
// so their checkers go round anticlockwise, from the top right to the bottom right and off into
// the tray on the right. A spectator sees it from the first to move's side. The dice the side to
// move rolled are in the middle, on their half.
//
// The player to move builds their turn a checker at a time: a tap on one of theirs that can move
// picks it up, its points to go to are marked, and a tap on one moves it there, keeping hold of it
// so a second tap moves it on. Only moves that still leave a whole turn to play are offered, as
// the bot only takes a whole turn. Undo takes a checker's move back, and Done, once the dice are
// used, sends the turn. A roll with no move is played by the bot. Each player's row shows their
// pip count. The rest of the page is any duel's (`duel/view.ts`).
import {
    BAR,
    CHECKERS,
    OFF,
    diceName,
    type Backgammon,
    type Dice,
    type Turn,
} from "../../games/backgammon/board";
import { BACKGAMMON } from "../../games/backgammon/rules";
import type { Seat } from "../../games/duel/types";
import { duelView } from "../duel/view";

/** A checker's width, and so a point's */
const D = 10;
/** The frame round the board */
const F = 4;
/** A point's length: five checkers */
const H = 5 * D;
/** The gap between the top and bottom points, where the dice are */
const GAP = 12;
/** The bar's width, and the tray's for the checkers borne off */
const BAR_W = D;
const TRAY_W = 12;

const LEFT = F;
const BAR_X = LEFT + 6 * D;
const RIGHT = BAR_X + BAR_W;
const TRAY_X = RIGHT + 6 * D + F;
const WIDTH = TRAY_X + TRAY_W + F;
const TOP = F;
const BOTTOM = F + 2 * H + GAP;
const HEIGHT = BOTTOM + F;
const MIDDLE = HEIGHT / 2;

/** Where a viewer's own point is drawn: its left edge, and whether it's on the top row */
function place(point: number): { x: number; top: boolean } {
    if (point <= 6) return { x: RIGHT + (6 - point) * D, top: false };
    if (point <= 12) return { x: LEFT + (12 - point) * D, top: false };
    if (point <= 18) return { x: LEFT + (point - 13) * D, top: true };
    return { x: RIGHT + (point - 19) * D, top: true };
}

/** The centre of the i-th of n checkers stacked from a point's base, closer up past five */
function stacked(i: number, n: number, top: boolean, base: number, length = H): number {
    const step = n > 5 ? (length - D) / (n - 1) : D;
    const offset = D / 2 + i * step;
    return top ? base + offset : base - offset;
}

const PIPS: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
        [-1, -1],
        [1, 1],
    ],
    3: [
        [-1, -1],
        [0, 0],
        [1, 1],
    ],
    4: [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ],
    5: [
        [-1, -1],
        [1, -1],
        [0, 0],
        [-1, 1],
        [1, 1],
    ],
    6: [
        [-1, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
    ],
};

function die(cx: number, value: number, used: boolean): string {
    const s = 8.4;
    const pips = PIPS[value]
        .map(([dx, dy]) => `<circle cx="${cx + dx * 2.2}" cy="${MIDDLE + dy * 2.2}" r="0.85"/>`)
        .join("");
    return `<g class="die${used ? " used" : ""}"><rect x="${cx - s / 2}" y="${MIDDLE - s / 2}" width="${s}" height="${s}" rx="1.6"/>${pips}</g>`;
}

/** The dice in the middle of the mover's half: four of a double, the used ones faded */
function dice(values: Dice, left: readonly number[] | undefined, moverAtBottom: boolean): string {
    const all = values[0] === values[1] ? [values[0], values[0], values[0], values[0]] : values;
    const unused = left === undefined ? undefined : [...left];
    const centre = moverAtBottom ? RIGHT + 3 * D : LEFT + 3 * D;
    const spacing = 10.5;
    return all
        .map((value, i) => {
            const cx = centre + (i - (all.length - 1) / 2) * spacing;
            let used = false;
            if (unused !== undefined) {
                const at = unused.indexOf(value);
                if (at >= 0) unused.splice(at, 1);
                else used = true;
            }
            return die(cx, value, used);
        })
        .join("");
}

function checker(seat: Seat, cx: number, cy: number, classes = ""): string {
    return `<circle class="checker seat-${seat}${classes}" cx="${cx}" cy="${cy.toFixed(2)}" r="${D / 2 - 0.4}"/>`;
}

/** The turn being built, kept while its position stands */
let turn: Turn | undefined;
let turnKey = "";
/** The point, the mover's own, of the checker picked up */
let held: number | undefined;

/** The side to move's turn as it's being built, if they've rolled */
function turnFor(board: Backgammon): Turn | undefined {
    if (board.dice === undefined || board.outcome !== undefined) return undefined;
    const key = `${board.moves}:${board.turn}:${diceName(board.dice)}`;
    if (key !== turnKey) {
        turnKey = key;
        turn = board.turnWith(board.dice);
        held = undefined;
    }
    return turn;
}

/** The points the held checker can go to, and where any of the mover's checkers can move from */
function choices(t: Turn): { from: Set<number>; to: Set<number> } {
    const options = t.options();
    const from = new Set(options.map((o) => o.from));
    // The only checker that can move is picked up for the player, eg. one on the bar
    if (held === undefined && from.size === 1) held = [...from][0];
    if (held !== undefined && !from.has(held)) held = undefined;
    return { from, to: new Set(options.filter((o) => o.from === held).map((o) => o.to)) };
}

export const backgammonView = duelView(BACKGAMMON, {
    className: "backgammon",
    ratio: WIDTH / HEIGHT,

    draw(el, board: Backgammon, { playable, mine }) {
        const viewer: Seat = mine ?? 0;
        const other: Seat = viewer === 0 ? 1 : 0;
        // The turn being built is drawn while the player's making it, and while it's being sent
        const building = turnFor(board);
        const shown = building !== undefined && (playable || building.steps.length > 0);
        const mover = board.turn;
        const checkersOf = (seat: Seat): readonly number[] =>
            shown && building !== undefined
                ? seat === mover
                    ? building.mine
                    : building.theirs
                : board.checkers(seat);
        const ours = checkersOf(viewer);
        const theirs = checkersOf(other);
        const picking = playable && building !== undefined ? choices(building) : undefined;
        // The viewer's point a seat's point is
        const view = (seat: Seat, point: number) => (seat === viewer ? point : 25 - point);
        // Where the last turn's checkers went, until the next is under way
        const landed = new Set<number>();
        if (!shown || building?.steps.length === 0) {
            for (const step of board.last?.steps ?? []) {
                if (step.to !== OFF) landed.add(view(board.last!.seat, step.to));
            }
        }

        const parts: string[] = [];
        parts.push(`<rect class="frame" width="${WIDTH}" height="${HEIGHT}" rx="2"/>`);
        parts.push(
            `<rect class="felt" x="${LEFT}" y="${TOP}" width="${6 * D}" height="${2 * H + GAP}"/>`,
        );
        parts.push(
            `<rect class="felt" x="${RIGHT}" y="${TOP}" width="${6 * D}" height="${2 * H + GAP}"/>`,
        );
        parts.push(
            `<rect class="tray" x="${TRAY_X}" y="${TOP}" width="${TRAY_W}" height="${2 * H + GAP}"/>`,
        );

        for (let point = 1; point <= 24; point++) {
            const { x, top } = place(point);
            const base = top ? TOP : BOTTOM;
            const tip = top ? TOP + H - 2 : BOTTOM - H + 2;
            const shade = point % 2 === 0 ? "a" : "b";
            parts.push(
                `<polygon class="point point-${shade}" points="${x},${base} ${x + D},${base} ${x + D / 2},${tip}"/>`,
            );
            const seat: Seat | undefined =
                ours[point] > 0 ? viewer : theirs[25 - point] > 0 ? other : undefined;
            const n = seat === undefined ? 0 : seat === viewer ? ours[point] : theirs[25 - point];
            const cx = x + D / 2;
            const movable = seat === viewer && seat === mover && picking?.from.has(point);
            for (let i = 0; i < n; i++) {
                let classes = "";
                if (i === n - 1) {
                    if (movable) classes += held === point ? " held" : " movable";
                    if (landed.has(point)) classes += " landed";
                }
                parts.push(checker(seat!, cx, stacked(i, n, top, base), classes));
            }
            if (n > 5) {
                parts.push(
                    `<text class="count seat-${seat}" x="${cx}" y="${(stacked(n - 1, n, top, base) + 1.3).toFixed(2)}">${n}</text>`,
                );
            }
            if (picking?.to.has(point)) {
                const cy = stacked(Math.min(n, 4), Math.max(n + 1, 1), top, base);
                parts.push(
                    `<circle class="target" cx="${cx}" cy="${cy.toFixed(2)}" r="${D / 2 - 1}"/>`,
                );
            }
        }

        // The bar: the viewer's checkers below the middle, the other's above it
        parts.push(
            `<rect class="bar" x="${BAR_X}" y="${TOP}" width="${BAR_W}" height="${2 * H + GAP}"/>`,
        );
        for (const [seat, n, below] of [
            [viewer, ours[BAR], true],
            [other, theirs[BAR], false],
        ] as const) {
            const base = below ? MIDDLE + GAP / 2 : MIDDLE - GAP / 2;
            for (let i = 0; i < n; i++) {
                let classes = "";
                if (i === n - 1 && seat === mover && picking?.from.has(BAR)) {
                    classes = held === BAR ? " held" : " movable";
                }
                parts.push(checker(seat, BAR_X + BAR_W / 2, stacked(i, n, below, base), classes));
            }
        }

        // The tray: what each side's borne off, as checkers edge on, the viewer's at the bottom
        for (const [seat, n, top] of [
            [viewer, ours[OFF], false],
            [other, theirs[OFF], true],
        ] as const) {
            const slab = H / CHECKERS;
            for (let i = 0; i < n; i++) {
                const y = top ? TOP + i * slab : BOTTOM - (i + 1) * slab;
                parts.push(
                    `<rect class="off seat-${seat}" x="${TRAY_X + 1}" y="${y.toFixed(2)}" width="${TRAY_W - 2}" height="${(slab - 0.4).toFixed(2)}" rx="0.6"/>`,
                );
            }
        }
        if (picking?.to.has(OFF)) {
            parts.push(
                `<rect class="target" x="${TRAY_X + 0.5}" y="${MIDDLE + GAP / 2}" width="${TRAY_W - 1}" height="${H}" rx="1.5"/>`,
            );
        }

        // The dice: the side to move's roll, or, once a game's over or while stepping through it,
        // the roll that made the position, faded
        if (board.dice !== undefined) {
            const left = shown && building !== undefined ? building.left : undefined;
            parts.push(dice(board.dice, left, mover === viewer));
        } else if (board.last !== undefined) {
            parts.push(dice(board.last.dice, [], board.last.seat === viewer));
        }

        // What a tap picks up or puts down, over the rest: each point's half of the board, the
        // bar and the tray
        if (picking !== undefined) {
            const hit = (x: number, y: number, w: number, h: number, tap: string, label: string) =>
                `<rect class="hit" x="${x}" y="${y}" width="${w}" height="${h}" data-action="board" data-tap="${tap}" role="gridcell" aria-label="${label}"/>`;
            for (let point = 1; point <= 24; point++) {
                const { x, top } = place(point);
                if (!picking.from.has(point) && !picking.to.has(point)) continue;
                parts.push(
                    hit(x, top ? 0 : MIDDLE, D, MIDDLE, String(point), `Your ${point} point`),
                );
            }
            if (picking.from.has(BAR)) {
                parts.push(hit(BAR_X, 0, BAR_W, HEIGHT, "bar", "The bar"));
            }
            if (picking.to.has(OFF)) {
                parts.push(hit(TRAY_X - F, MIDDLE, TRAY_W + 2 * F, MIDDLE, "off", "Bear off"));
            }
        }

        el.innerHTML = `<svg role="presentation" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
    },

    moveOf(el) {
        return el.dataset.move;
    },

    onTap(el, board) {
        const t = turnFor(board);
        if (t === undefined) return;
        const tap = el.dataset.tap;
        if (tap === "undo") {
            t.undo();
            held = undefined;
            return;
        }
        const point = tap === "bar" ? BAR : tap === "off" ? OFF : Number(tap);
        if (!Number.isInteger(point)) return;
        const { from, to } = choices(t);
        if (held !== undefined && to.has(point)) {
            t.play({ from: held, to: point });
            // Kept hold of, so a second tap moves it on
            held = point;
            return;
        }
        held = from.has(point) && held !== point ? point : undefined;
    },

    extraMoves(board) {
        const t = turnFor(board);
        if (t === undefined) return [];
        return [
            { tap: "undo", label: "Undo", disabled: t.steps.length === 0 },
            { move: t.move(), label: "Done", disabled: !t.done },
        ];
    },

    score(board, seat) {
        return `${board.pips(seat)} pips`;
    },

    note(board, name) {
        const last = board.last;
        if (board.outcome !== undefined || last === undefined || last.steps.length > 0) {
            return undefined;
        }
        const [high, low] = last.dice;
        const roll = high === low ? `double ${high}s` : `${high} and ${low}`;
        return `${name(last.seat)} rolled ${roll} and couldn't move`;
    },
});
