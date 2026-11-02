// Reversi's board: eight by eight squares with the players' discs, Black first. The squares the
// player can take are marked while it's their move, and a tap takes one. The disc just put down is
// marked, and the discs it flipped turn over. Each player's row shows their count, and the page
// says when a player had no move and passed. The rest of the page is any duel's (`duel/view.ts`).
import { SIZE, squareName, type Board } from "../../games/reversi/board";
import { REVERSI } from "../../games/reversi/rules";
import { duelView } from "../duel/view";

export const reversiView = duelView(REVERSI, {
    className: "reversi",
    ratio: 1,

    draw(el, board: Board, { playable, fresh, mine }) {
        const legal = new Set(playable ? board.legalMoves() : []);
        const flipped = new Set(fresh ? board.flipped : []);
        const squares: HTMLElement[] = [];
        for (let index = 0; index < SIZE * SIZE; index++) {
            const name = squareName(index);
            const square = document.createElement("div");
            square.className = "square";
            square.setAttribute("role", "gridcell");
            if (legal.has(name)) {
                square.dataset.action = "play";
                square.dataset.move = name;
                square.classList.add("playable", "hint", `seat-${mine}`);
            }
            const seat = board.at(index);
            if (seat !== null) {
                const disc = document.createElement("span");
                disc.className = `disc seat-${seat}`;
                if (index === board.last) {
                    disc.classList.add("last");
                    if (fresh) disc.classList.add("placed");
                }
                if (flipped.has(index)) disc.classList.add("flip");
                square.append(disc);
            }
            square.setAttribute(
                "aria-label",
                `${name}${seat === null ? "" : seat === 0 ? ", black" : ", white"}`,
            );
            squares.push(square);
        }
        el.replaceChildren(...squares);
    },

    moveOf(el) {
        return el.dataset.move;
    },

    score(board, seat) {
        return board.count(seat);
    },

    note(board, name) {
        if (board.outcome !== undefined || board.passed === undefined) return undefined;
        return `${name(board.passed)} had no move, so ${name(board.turn)} goes again`;
    },
});
