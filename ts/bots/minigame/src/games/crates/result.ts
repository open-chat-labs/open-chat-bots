// How a Crate Race ended, in words, as the card's result says it, naming the winner with a
// mention, and as the page says it, by their username. It's here rather than in the race, which
// the page doesn't load, as the race has every level.
import { duration } from "../race2048/race";
import type { SharedState } from "./types";

export type Ended = Pick<SharedState, "winner" | "ended" | "startedAt" | "finishedAt">;

/**
 * Eg. "Alice put every crate on a goal in 1m 12s, with 23 pushes", or "Time's up! Bob put the most
 * crates on goals, 3 of 4", with `winner` the winner's crates and pushes and `name` naming them
 */
export function describeResult(
    s: Ended,
    winner: { placed: number; pushes: number; crates: number } | undefined,
    name: (id: string) => string,
): string {
    if (s.winner === undefined || winner === undefined) {
        return s.ended === "time" ? "Time's up! Nobody put a crate on a goal" : "The race is over";
    }
    const who = name(s.winner);
    if (s.ended === "solved" && s.startedAt !== undefined && s.finishedAt !== undefined) {
        const pushes = `${winner.pushes} push${winner.pushes === 1 ? "" : "es"}`;
        return `${who} put every crate on a goal in ${duration(s.finishedAt - s.startedAt)}, with ${pushes}`;
    }
    return `Time's up! ${who} put the most crates on goals, ${winner.placed} of ${winner.crates}`;
}
