// How a guess is marked against the word, which only the bot knows, and what the marks say: how
// close a guess came, and, for the page's keyboard, what's known of each letter.
import { HIT, MISS, NEAR, type Marks } from "./types";

/**
 * Each of the guess's letters marked: in the word's place for it, in the word elsewhere, or not
 * in it. A letter the guess has more often than the word is marked in the word only as many
 * times as the word has it, its places first, then from the left.
 */
export function mark(guess: string, word: string): Marks {
    const marks: string[] = [...guess].map((letter, i) => (letter === word[i] ? HIT : MISS));
    // The word's letters the guess hasn't hit, which its other letters can be near
    const left = new Map<string, number>();
    [...word].forEach((letter, i) => {
        if (marks[i] !== HIT) left.set(letter, (left.get(letter) ?? 0) + 1);
    });
    [...guess].forEach((letter, i) => {
        const n = left.get(letter) ?? 0;
        if (marks[i] === HIT || n === 0) return;
        marks[i] = NEAR;
        left.set(letter, n - 1);
    });
    return marks.join("");
}

/** Whether the marks say the guess was the word */
export function guessed(marks: Marks): boolean {
    return marks.length > 0 && [...marks].every((m) => m === HIT);
}

/** How close a guess came: its letters in place, then its letters in the word elsewhere */
export function closeness(marks: Marks): [hits: number, nears: number] {
    let hits = 0;
    let nears = 0;
    for (const m of marks) {
        if (m === HIT) hits++;
        else if (m === NEAR) nears++;
    }
    return [hits, nears];
}

/** Which of two guesses' closeness is the closer: negative when it's the first */
export function closer(a: Marks, b: Marks): number {
    const [ah, an] = closeness(a);
    const [bh, bn] = closeness(b);
    return bh - ah || bn - an;
}

/**
 * What the guesses say of each letter they have, the most any of them said: that it's in the word
 * in a place it was guessed in, that it's in the word, or that it isn't
 */
export function letterMarks(
    guesses: readonly string[],
    marks: readonly Marks[],
): Map<string, string> {
    const known = new Map<string, string>();
    guesses.forEach((guess, g) => {
        [...guess].forEach((letter, i) => {
            const m = marks[g]?.[i];
            if (m === undefined) return;
            const was = known.get(letter);
            if (was === undefined || Number(m) > Number(was)) known.set(letter, m);
        });
    });
    return known;
}
