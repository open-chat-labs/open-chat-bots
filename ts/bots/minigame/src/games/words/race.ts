// The Word Race: up to twenty racers guess the same five-letter word, each on their own, with six
// guesses each. Each guess's letters are marked: in the word in that place, in the word elsewhere,
// or not in it. The first to guess the word wins. If the time runs out first, or everyone's had all
// their guesses, whoever came closest wins: the most letters in place in a guess, then the most in
// the word, then whoever got there first. Only the bot knows the word: a racer's page sends their
// guess, and the bot answers with their guesses, marked, which also come in their private part of
// each state. Everyone else sees only the marks until the race is over.
import type { Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
import { closer, guessed, mark } from "./marks";
import { describeResult } from "./result";
import { WORDS_SETTINGS } from "./settings";
import {
    GAME_ID,
    LENGTH,
    MAX_PLAYERS,
    STATE_VERSION,
    TRIES,
    type Ending,
    type GuessResponse,
    type Marks,
    type OwnGuesses,
    type SharedState,
} from "./types";
import { ANSWERS, OTHER_WORDS } from "./words";

/** Every word a guess may be */
const WORDS = new Set([...ANSWERS, ...OTHER_WORDS]);

/** A guess as a request may send it, in either case */
const GUESS = new RegExp(`^[a-zA-Z]{${LENGTH}}$`);

export type Racer = Seat & {
    guesses: string[];
    marks: Marks[];
    /** When each guess was made, which breaks a tie for the closest */
    at: number[];
};

export type WordsData = RaceData<Racer, Ending> & {
    /** The word, once the race has started */
    word?: string;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type GuessOutcome = { result: GuessResponse; changed: boolean };

export class WordRace extends Race<Racer, Ending, WordsData, SharedState> {
    readonly kind = GAME_ID;

    constructor(data: WordsData, options: RaceOptions = {}) {
        super({ settings: WORDS_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): WordRace {
        return new WordRace(openRace(options), options);
    }

    /** Picks the word, and starts everyone seated with no guesses */
    protected begin(seats: readonly Seat[]): Racer[] {
        this.data.word = ANSWERS[Math.floor(this.random() * ANSWERS.length)];
        return seats.map((s) => ({ ...s, guesses: [], marks: [], at: [] }));
    }

    /** A racer's own guesses, which only they see while the race is on */
    own(userId: string): OwnGuesses | undefined {
        const racer = this.racer(userId);
        if (racer === undefined) return undefined;
        return { guesses: [...racer.guesses], marks: [...racer.marks] };
    }

    /**
     * A racer's guess, `{ "guess": "crane" }`, answered with their guesses, marked. No guess at
     * all just asks for them, eg. as the page opens.
     */
    guess(userId: string, body: unknown): GuessOutcome {
        const d = this.data;
        const fail = (error: string): GuessOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed: false,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = this.racer(userId);
        if (racer === undefined) return fail("You aren't in this race");
        const raw = (body as { guess?: unknown } | undefined)?.guess;
        if (raw === undefined) {
            return { result: { ok: true, own: this.own(userId)! }, changed: false };
        }
        if (d.phase === "finished") return fail("The race is over");
        if (typeof raw !== "string" || !GUESS.test(raw)) {
            return fail(`A guess is a word of ${LENGTH} letters`);
        }
        const guess = raw.toLowerCase();
        if (racer.guesses.length >= TRIES) return fail("You've had all your guesses");
        if (racer.guesses.includes(guess)) return fail("You've guessed that already");
        if (!WORDS.has(guess)) return fail("That isn't in the word list");
        const marks = mark(guess, d.word!);
        racer.guesses.push(guess);
        racer.marks.push(marks);
        racer.at.push(this.now());
        if (guessed(marks)) {
            this.finish("guessed", racer.id, this.now());
        } else if (d.players.every((p) => p.guesses.length >= TRIES)) {
            this.finish("out", this.leader(), this.now());
        } else {
            this.changed();
        }
        return { result: { ok: true, own: this.own(userId)! }, changed: true };
    }

    /**
     * Whoever came closest: their closest guess had the most letters in place, then the most in
     * the word elsewhere, and they made it first. Nobody, if nobody guessed.
     */
    protected leader(): string | undefined {
        let best: { id: string; marks: Marks; at: number } | undefined;
        for (const p of this.data.players) {
            p.marks.forEach((marks, i) => {
                const at = p.at[i] ?? 0;
                const order = best === undefined ? -1 : closer(marks, best.marks) || at - best.at;
                if (order < 0) best = { id: p.id, marks, at };
            });
        }
        return best?.id;
    }

    /** Each racer's own guesses while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnGuesses> | undefined {
        if (this.data.phase !== "active") return undefined;
        return Object.fromEntries(this.data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /** What everyone sees: each racer's marks, and, once it's over, their guesses and the word */
    shared(): SharedState {
        const d = this.data;
        const finished = d.phase === "finished";
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            racers: d.players.map(({ id, marks, guesses }) =>
                finished
                    ? { id, marks: [...marks], guesses: [...guesses] }
                    : { id, marks: [...marks] },
            ),
            word: finished ? d.word : undefined,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) guessed CRANE in 48s, with 3
     * guesses", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        const tries = d.players.find((p) => p.id === d.winner)?.guesses.length ?? 0;
        return describeResult(d, tries, (id) => `@UserId(${id})`);
    }
}
