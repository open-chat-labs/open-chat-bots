// What's been taken, and who's ahead, worked out from positions, for the page to show by each
// player's name: a finished game's end state has every position, so the page can say what had been
// taken by any move the viewer steps to. A position is a FEN, or its placement field, eg.
// "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", in which White's pieces are capitals.
import type { Captured } from "./types";

/** What a piece is worth, in pawns, as players count it */
const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** The pieces that can be taken, cheapest first, the order they're shown in */
export const TAKEN_ORDER = "pnbrq";

/**
 * What each side had taken by the last of the positions, which must be every position from the
 * start: a move takes at most one piece, which is whatever piece the other side has fewer of after
 * it. A promotion changes only the mover's pieces, and leaves them as many.
 */
export function capturedBetween(positions: readonly string[]): Captured {
    const captured: Captured = { white: "", black: "" };
    for (let i = 1; i < positions.length; i++) {
        const before = count(positions[i - 1]);
        const after = count(positions[i]);
        for (const taker of ["white", "black"] as const) {
            // The other side's letter for a piece: Black's are small
            const theirs = (t: string) => (taker === "white" ? t : t.toUpperCase());
            if (total(after, theirs) >= total(before, theirs)) continue;
            const lost = [...TAKEN_ORDER].find(
                (t) => (after[theirs(t)] ?? 0) < (before[theirs(t)] ?? 0),
            );
            if (lost !== undefined) captured[taker] += lost;
        }
    }
    return captured;
}

/** How far White is ahead on the board, in pawns: below 0 when Black is */
export function materialLead(position: string): number {
    let lead = 0;
    for (const ch of board(position)) {
        const value = VALUES[ch.toLowerCase()];
        if (value !== undefined) lead += ch === ch.toUpperCase() ? value : -value;
    }
    return lead;
}

/** How many of each piece there are, by its letter */
function count(position: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const ch of board(position)) {
        if (/[a-z]/i.test(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return counts;
}

/** The pieces on the board, without the rest of a FEN, whose castling rights are letters too */
function board(position: string): string {
    return position.split(" ")[0];
}

/** How many pieces a side has, other than its king, given its letter for each */
function total(counts: Record<string, number>, letter: (t: string) => string): number {
    return [...TAKEN_ORDER].reduce((sum, t) => sum + (counts[letter(t)] ?? 0), 0);
}
