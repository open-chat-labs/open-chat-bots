// A finished game as PGN, the text every chess program reads, for the page to give the viewer to
// take to an engine or a database: the Seven Tag Roster, the time control if known, then the moves,
// with how the game ended as a comment before the result.
import type { Side } from "./types";

export type PgnGame = {
    /** The players' names */
    white: string;
    black: string;
    /** In standard algebraic notation, from the usual starting position */
    moves: readonly string[];
    /** Who won, null for a draw, or undefined if it isn't known */
    winner: Side | null | undefined;
    /** How the game ended, in words, eg. "Black won on time" */
    result?: string;
    /** When the game started, for its date */
    startedAt?: number;
    /** Each side's time for the game and the time added per move, in seconds */
    timeControl?: { seconds: number; increment: number };
};

/** PGN's lines are kept within 80 characters, as its export format asks */
const LINE = 79;

export function toPgn(game: PgnGame): string {
    const score =
        game.winner === "white"
            ? "1-0"
            : game.winner === "black"
              ? "0-1"
              : game.winner === null
                ? "1/2-1/2"
                : "*";
    const tags: [string, string][] = [
        ["Event", "Casual game"],
        ["Site", "OpenChat"],
        ["Date", game.startedAt === undefined ? "????.??.??" : pgnDate(game.startedAt)],
        ["Round", "-"],
        ["White", game.white],
        ["Black", game.black],
        ["Result", score],
    ];
    if (game.timeControl !== undefined) {
        tags.push(["TimeControl", `${game.timeControl.seconds}+${game.timeControl.increment}`]);
    }

    const tokens: string[] = [];
    game.moves.forEach((san, i) => {
        if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
        tokens.push(san);
    });
    // A comment can't hold a closing brace, so none is let in
    const said = game.result?.replace(/[{}]/g, "").trim();
    if (said) tokens.push(`{${said}}`);
    tokens.push(score);

    const lines: string[] = [];
    let line = "";
    for (const token of tokens) {
        if (line !== "" && line.length + 1 + token.length > LINE) {
            lines.push(line);
            line = token;
        } else {
            line = line === "" ? token : `${line} ${token}`;
        }
    }
    lines.push(line);

    return `${tags.map(([name, value]) => `[${name} "${tagValue(value)}"]`).join("\n")}\n\n${lines.join("\n")}\n`;
}

/** The day in UTC, as PGN writes it, eg. "2026.11.03" */
function pgnDate(ms: number): string {
    const d = new Date(ms);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}.${two(d.getUTCMonth() + 1)}.${two(d.getUTCDate())}`;
}

/**
 * A tag's value, on one line, with a quote as an apostrophe and a backslash as a slash: PGN can
 * escape them, but not every program reads the escapes, chess.js for one
 */
function tagValue(text: string): string {
    return text.replace(/\s+/g, " ").replaceAll('"', "'").replaceAll("\\", "/");
}
