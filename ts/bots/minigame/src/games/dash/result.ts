// How a Dash Race ended, in words, as the card's result says it, naming the winner with a mention,
// and as the page says it, by their username
import { START_TICK, TICKS_PER_SECOND } from "./runner";
import type { SharedState } from "./types";

export type Ended = Pick<SharedState, "winner" | "ended">;

/**
 * How long a run took to a tick, eg. "41.3s" or "1m 12.0s", from the tick everyone set off on, or
 * from the race's start in a race from before they all did (`STATE_VERSION` 1): a tick's time is
 * its end
 */
export function runTime(tick: number, from = START_TICK): string {
    const tenths = Math.max(0, Math.round(((tick + 1 - from) * 10) / TICKS_PER_SECOND));
    const minutes = Math.floor(tenths / 600);
    const seconds = `${Math.floor((tenths % 600) / 10)}.${tenths % 10}s`;
    return minutes > 0 ? `${minutes}m ${seconds}` : seconds;
}

export function fallsText(falls: number): string {
    return falls === 0 ? "without a fall" : `with ${falls} fall${falls === 1 ? "" : "s"}`;
}

/**
 * Eg. "Alice reached the flag in 41.3s, with 2 falls", or "Time's up! Bob got furthest, 72% of
 * the way", with `winner` the winner's run and how far it got, `name` naming them, and the time
 * from `from`, as `runTime`'s
 */
export function describeResult(
    s: Ended,
    winner: { falls: number; finished?: number; percent: number } | undefined,
    name: (id: string) => string,
    from = START_TICK,
): string {
    if (s.winner === undefined || winner === undefined) {
        return s.ended === "time" ? "Time's up! Nobody set off" : "The race is over";
    }
    const who = name(s.winner);
    if (s.ended === "flag" && winner.finished !== undefined) {
        const time = runTime(winner.finished, from);
        return `${who} reached the flag in ${time}, ${fallsText(winner.falls)}`;
    }
    return `Time's up! ${who} got furthest, ${winner.percent}% of the way`;
}
