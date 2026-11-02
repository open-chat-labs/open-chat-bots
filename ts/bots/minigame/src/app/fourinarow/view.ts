// Four in a Row's board: the grid standing up, seven columns of six cells, with the players' discs.
// A tap anywhere in a column drops the player's disc into it; the cell it would land in is marked,
// more strongly under the pointer. The disc just played falls into place, and once the game's won,
// the line is ringed. The rest of the page is any duel's (`duel/view.ts`).
import { cellIndex, COLUMNS, ROWS, type Grid } from "../../games/fourinarow/grid";
import { FOUR_IN_A_ROW } from "../../games/fourinarow/rules";
import { duelView } from "../duel/view";

export const fourInARowView = duelView(FOUR_IN_A_ROW, {
    className: "grid",
    ratio: COLUMNS / ROWS,

    draw(board, grid: Grid, { playable, last, fresh, mine }) {
        const line = new Set(grid.line ?? []);
        const cells: HTMLElement[] = [];
        const columns: HTMLElement[][] = Array.from({ length: COLUMNS }, () => []);
        for (let row = ROWS - 1; row >= 0; row--) {
            for (let column = 0; column < COLUMNS; column++) {
                const cell = document.createElement("div");
                cell.className = "slot";
                cell.setAttribute("role", "gridcell");
                const open = grid.height(column) < ROWS;
                if (playable && open) {
                    cell.dataset.action = "play";
                    cell.dataset.move = String(column);
                    cell.classList.add("playable");
                    if (grid.height(column) === row) cell.classList.add("next", `seat-${mine}`);
                }
                const seat = grid.at(column, row);
                if (seat !== null) {
                    const disc = document.createElement("span");
                    disc.className = `disc seat-${seat}`;
                    if (line.has(cellIndex(column, row))) disc.classList.add("win");
                    // The disc just played is the top of its column
                    if (last === column && grid.height(column) - 1 === row) {
                        disc.classList.add("last");
                        if (fresh) {
                            disc.classList.add("drop");
                            disc.style.setProperty("--fall", String(ROWS - row));
                        }
                    }
                    cell.append(disc);
                }
                cell.setAttribute(
                    "aria-label",
                    `Column ${column + 1}, row ${row + 1}${seat === null ? "" : `, player ${seat + 1}`}`,
                );
                cells.push(cell);
                columns[column].push(cell);
            }
        }
        // Under a pointer, the whole column is the target, and where the disc would land shows
        for (const column of columns) {
            for (const cell of column) {
                cell.addEventListener("pointerenter", () => {
                    for (const c of column) c.classList.add("hover");
                });
                cell.addEventListener("pointerleave", () => {
                    for (const c of column) c.classList.remove("hover");
                });
            }
        }
        board.replaceChildren(...cells);
    },

    moveOf(el) {
        const column = Number(el.dataset.move);
        return Number.isInteger(column) ? column : undefined;
    },
});
