// Hex's board: a rhombus of hexagons, drawn as SVG, each row half a cell right of the one above,
// with the first player's edges, top and bottom, in their colour, and the second player's, left
// and right, in theirs. A tap on an empty cell puts the player's stone there; under the pointer,
// the cell shows the stone it would get. The stone just put down is marked, and once someone's
// won, so is the chain joining their edges. The second player can swap instead of putting down
// their first stone, with the button beside Resign. The rest of the page is any duel's
// (`duel/view.ts`).
import { cellName, SWAP, type HexBoard } from "../../games/hex/board";
import { HEX } from "../../games/hex/rules";
import type { Seat } from "../../games/duel/types";
import { duelView } from "../duel/view";

/** A cell's radius, centre to corner, in the drawing's units */
const R = 10;
/** A cell's width, side to side */
const W = Math.sqrt(3) * R;
/** Room round the cells for the edges' colours */
const PAD = R * 0.9;

/** A cell's corners, clockwise from the top, from its centre */
const CORNERS = [-90, -30, 30, 90, 150, 210].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [Math.cos(rad), Math.sin(rad)];
});

/** The width over the height of the drawing, near enough for every size: 9 by 9 is 1.54, 13 1.59 */
const RATIO = 1.57;

function centre(n: number, index: number): [number, number] {
    const row = Math.floor(index / n);
    const column = index % n;
    return [PAD + W / 2 + (column + row / 2) * W, PAD + R + row * 1.5 * R];
}

function corners(cx: number, cy: number, r: number): string {
    return CORNERS.map(([x, y]) => `${(cx + x * r).toFixed(2)},${(cy + y * r).toFixed(2)}`).join(
        " ",
    );
}

// The edges round the board, a side of a cell at a time, in the colour of whoever joins them. A
// cell's side k runs from its corner k to its corner k + 1, clockwise from the top.
function edges(n: number): string {
    const side = (index: number, k: number, seat: Seat) => {
        const [cx, cy] = centre(n, index);
        const [x1, y1] = CORNERS[k];
        const [x2, y2] = CORNERS[(k + 1) % 6];
        return `<line class="edge seat-${seat}" x1="${(cx + x1 * R).toFixed(2)}" y1="${(cy + y1 * R).toFixed(2)}" x2="${(cx + x2 * R).toFixed(2)}" y2="${(cy + y2 * R).toFixed(2)}"/>`;
    };
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
        // The top row's upper sides and the bottom row's lower ones: the first player's
        lines.push(side(i, 5, 0), side(i, 0, 0));
        lines.push(side((n - 1) * n + i, 2, 0), side((n - 1) * n + i, 3, 0));
    }
    for (let i = 0; i < n; i++) {
        // The left column's left and lower-left sides and the right's right and upper-right: the
        // second player's, drawn last, so they have the two corners the edges share
        lines.push(side(i * n, 4, 1), side(i * n, 3, 1));
        lines.push(side(i * n + n - 1, 1, 1), side(i * n + n - 1, 0, 1));
    }
    return lines.join("");
}

export const hexView = duelView(HEX, {
    className: "hex",
    ratio: RATIO,

    draw(el, board: HexBoard, { playable, fresh, mine }) {
        const n = board.size;
        const width = 2 * PAD + W * (n + (n - 1) / 2);
        const height = 2 * PAD + R * (2 + 1.5 * (n - 1));
        const chain = new Set(board.chain);
        const rows: string[] = [];
        for (let row = 0; row < n; row++) {
            const cells: string[] = [];
            for (let column = 0; column < n; column++) {
                const index = row * n + column;
                const [cx, cy] = centre(n, index);
                const name = cellName(n, index);
                const seat = board.at(index);
                const classes = ["cell"];
                let action = "";
                if (seat !== null) {
                    classes.push("stone", `seat-${seat}`);
                    if (index === board.last && fresh) classes.push("placed");
                } else if (playable) {
                    classes.push("playable", `seat-${mine}`);
                    action = ` data-action="play" data-move="${name}"`;
                }
                const label = `${name}${seat === null ? "" : seat === 0 ? ", first player's" : ", second player's"}`;
                let marks = "";
                if (chain.has(index)) {
                    marks += `<polygon class="chain" points="${corners(cx, cy, R * 0.55)}"/>`;
                }
                if (index === board.last) {
                    marks += `<circle class="last" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${R * 0.26}"/>`;
                }
                cells.push(
                    `<polygon class="${classes.join(" ")}" points="${corners(cx, cy, R)}" role="gridcell" aria-label="${label}"${action}/>${marks}`,
                );
            }
            rows.push(`<g role="row">${cells.join("")}</g>`);
        }
        // The drawing itself is only there for its rows, which are the grid's
        el.innerHTML = `<svg role="presentation" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" preserveAspectRatio="xMidYMid meet">
            <g aria-hidden="true">${edges(n)}</g>${rows.join("")}</svg>`;
    },

    moveOf(el) {
        return el.dataset.move;
    },

    note(board, name) {
        const stones = board.count(0) + board.count(1);
        if (board.outcome !== undefined) return undefined;
        if (stones === 0) {
            return `${name(0)} joins the top and bottom, ${name(1)} the left and right`;
        }
        if (board.canSwap()) {
            return `${name(1)} can put down a stone, or swap and take the first one, reflected onto their own edges`;
        }
        if (board.swapped && board.count(0) === 0) {
            return `${name(1)} swapped, taking the first stone`;
        }
        return undefined;
    },

    extraMoves(board) {
        return board.canSwap() ? [{ move: SWAP, label: "Swap" }] : [];
    },
});
