// How a Word Race ended, in words, as the card's result says it, naming the winner with a mention,
// and as the page says it, by their username. It's here rather than in the race, which the page
// doesn't load, as the race has every word.
import { duration } from "../race2048/race";
import type { SharedState } from "./types";

export type Ended = Pick<SharedState, "word" | "winner" | "ended" | "startedAt" | "finishedAt">;

/**
 * Eg. "Alice guessed CRANE in 48s, with 3 guesses", or "Time's up! Nobody guessed CRANE, and
 * Bob came closest", with `tries` the winner's guesses and `name` naming them
 */
export function describeResult(s: Ended, tries: number, name: (id: string) => string): string {
    const word = (s.word ?? "").toUpperCase();
    if (s.winner === undefined) {
        return s.ended === "time" ? `Time's up! Nobody guessed ${word}` : `Nobody guessed ${word}`;
    }
    const who = name(s.winner);
    if (s.ended === "guessed" && s.startedAt !== undefined && s.finishedAt !== undefined) {
        const time = duration(s.finishedAt - s.startedAt);
        return `${who} guessed ${word} in ${time}, with ${tries} guess${tries === 1 ? "" : "es"}`;
    }
    return s.ended === "time"
        ? `Time's up! Nobody guessed ${word}, and ${who} came closest`
        : `Nobody guessed ${word}, and ${who} came closest`;
}
