// How a Dash Race ended, in words, as the card's result says it, naming the winner with a mention,
// and as the page says it, by their username
import { START_TICK, TICKS_PER_SECOND } from "./runner";
import type { SharedState } from "./types";

export type Ended = Pick<SharedState, "winner" | "ended">;

/**
 * How long a run took to a tick, from when everyone set off, eg. "41.3s" or "1m 12.0s": a tick's
 * time is its end
 */
export function runTime(tick: number): string {
    const tenths = Math.max(0, Math.round(((tick + 1 - START_TICK) * 10) / TICKS_PER_SECOND));
    const minutes = Math.floor(tenths / 600);
    const seconds = `${Math.floor((tenths % 600) / 10)}.${tenths % 10}s`;
    return minutes > 0 ? `${minutes}m ${seconds}` : seconds;
}

export function fallsText(falls: number): string {
    return falls === 0 ? "without a fall" : `with ${falls} fall${falls === 1 ? "" : "s"}`;
}

/**
 * Eg. "Alice reached the flag in 41.3s, with 2 falls", or "Time's up! Bob got furthest, 72% of
 * the way", with `winner` the winner's run and how far it got, and `name` naming them
 */
export function describeResult(
    s: Ended,
    winner: { falls: number; finished?: number; percent: number } | undefined,
    name: (id: string) => string,
): string {
    if (s.winner === undefined || winner === undefined) {
        return s.ended === "time" ? "Time's up! Nobody set off" : "The race is over";
    }
    const who = name(s.winner);
    if (s.ended === "flag" && winner.finished !== undefined) {
        return `${who} reached the flag in ${runTime(winner.finished)}, ${fallsText(winner.falls)}`;
    }
    return `Time's up! ${who} got furthest, ${winner.percent}% of the way`;
}
