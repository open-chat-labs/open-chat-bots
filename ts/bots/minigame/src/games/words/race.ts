// The Word Race: up to twenty racers guess the same five-letter word, each on their own, with six
// guesses each. Each guess's letters are marked: in the word in that place, in the word elsewhere,
// or not in it. The first to guess the word wins. If the time runs out first, or everyone's had all
// their guesses, whoever came closest wins: the most letters in place in a guess, then the most in
// the word, then whoever got there first. Only the bot knows the word: a racer's page sends their
// guess, and the bot answers with their guesses, marked, which also come in their private part of
// each state. Everyone else sees only the marks until the race is over.
import { PUBLISH_EVERY_MS, type ConfigureResult, type Game, type Host } from "../game";
import { duration } from "../race2048/race";
import { defaultSettings, type Settings } from "../settings";
import { closer, guessed, mark } from "./marks";
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
    type Phase,
    type Seat,
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

export type WordsData = {
    phase: Phase;
    /** Who's joined, before the start */
    seats: Seat[];
    /** Everyone racing, once it starts, in the order they joined */
    players: Racer[];
    /** The `seq` of the last state published through the service */
    seq: number;
    /** Goes up with every change, so the page can tell the newer of two states */
    rev: number;
    createdAt: number;
    startedAt?: number;
    endsAt?: number;
    finishedAt?: number;
    /** The word, once the race has started */
    word?: string;
    ended?: Ending;
    winner?: string;
    settings?: Settings;
    host?: string;
    hostName?: string;
};

export type WordsOptions = {
    random?: () => number;
    now?: () => number;
    settings?: Settings;
    host?: Host;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type GuessOutcome = { result: GuessResponse; changed: boolean };

export class WordRace implements Game {
    readonly kind = GAME_ID;
    readonly #data: WordsData;
    readonly #random: () => number;
    readonly #now: () => number;

    constructor(data: WordsData, options: WordsOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: WordsOptions = {}): WordRace {
        const now = options.now ?? Date.now;
        return new WordRace(
            {
                phase: "open",
                seats: [],
                players: [],
                seq: 0,
                rev: 0,
                createdAt: now(),
                settings: options.settings,
                host: options.host?.id,
                hostName: options.host?.name,
            },
            options,
        );
    }

    get data(): WordsData {
        return this.#data;
    }

    get phase(): Phase {
        return this.#data.phase;
    }

    get createdAt(): number {
        return this.#data.createdAt;
    }

    get finishedAt(): number | undefined {
        return this.#data.finishedAt;
    }

    isSeated(userId: string): boolean {
        return (
            this.#data.seats.some((s) => s.id === userId) ||
            this.#data.players.some((p) => p.id === userId)
        );
    }

    isPlayer(userId: string): boolean {
        return this.#data.players.some((p) => p.id === userId);
    }

    join(userId: string, name: string): string | undefined {
        if (this.#data.phase !== "open") return "The race has started";
        if (this.isSeated(userId)) return undefined;
        if (this.#data.seats.length >= MAX_PLAYERS) return `All ${MAX_PLAYERS} places are taken`;
        this.#data.seats.push({ id: userId, name });
        this.#changed();
        return undefined;
    }

    /** Frees the seat before the start; a racer who leaves after it keeps their guesses */
    leave(userId: string): boolean {
        if (this.#data.phase !== "open") return false;
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        if (this.#data.seats.length === before) return false;
        this.#changed();
        return true;
    }

    settings(): Settings {
        return { ...defaultSettings(WORDS_SETTINGS), ...this.#data.settings };
    }

    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#data.phase !== "open") return { ok: false, error: "The race has started" };
        if (userId !== this.#data.host) {
            return { ok: false, error: "Only the host can change the settings" };
        }
        this.#data.settings = { ...this.#data.settings, ...settings };
        this.#changed();
        return { ok: true };
    }

    cannotStart(): string | undefined {
        if (this.#data.phase !== "open") return undefined;
        return this.#data.seats.length === 0 ? "Nobody has joined yet" : undefined;
    }

    /** Picks the word, and starts everyone seated with no guesses */
    start(): string[] {
        const d = this.#data;
        if (d.phase === "open" && d.seats.length > 0) {
            const now = this.#now();
            d.word = ANSWERS[Math.floor(this.#random() * ANSWERS.length)];
            d.players = d.seats.map((s) => ({ ...s, guesses: [], marks: [], at: [] }));
            d.seats = [];
            d.phase = "active";
            d.startedAt = now;
            d.endsAt = now + this.settings().minutes * 60_000;
            this.#changed();
        }
        return d.players.map((p) => p.id);
    }

    /** Everyone races at once */
    waitingFor(): string[] {
        return [];
    }

    /** Ends the race when the time's up: whoever came closest wins */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || this.#now() < d.endsAt) return false;
        this.#finish("time", this.#closest(), d.endsAt);
        return true;
    }

    /** The bot was down: the race's clock doesn't run meanwhile */
    resume(downMs: number): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || downMs <= 0) return false;
        d.endsAt += downMs;
        this.#changed();
        return true;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /** A racer's own guesses, which only they see while the race is on */
    own(userId: string): OwnGuesses | undefined {
        const racer = this.#data.players.find((p) => p.id === userId);
        if (racer === undefined) return undefined;
        return { guesses: [...racer.guesses], marks: [...racer.marks] };
    }

    /**
     * A racer's guess, `{ "guess": "crane" }`, answered with their guesses, marked. No guess at
     * all just asks for them, eg. as the page opens.
     */
    guess(userId: string, body: unknown): GuessOutcome {
        const d = this.#data;
        const fail = (error: string): GuessOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed: false,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = d.players.find((p) => p.id === userId);
        if (racer === undefined) return fail("You aren't in this race");
        const raw = (body as { guess?: unknown } | undefined)?.guess;
        if (raw === undefined)
            return { result: { ok: true, own: this.own(userId)! }, changed: false };
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
        racer.at.push(this.#now());
        if (guessed(marks)) {
            this.#finish("guessed", racer.id, this.#now());
        } else if (d.players.every((p) => p.guesses.length >= TRIES)) {
            this.#finish("out", this.#closest(), this.#now());
        } else {
            this.#changed();
        }
        return { result: { ok: true, own: this.own(userId)! }, changed: true };
    }

    // Whoever came closest: their closest guess had the most letters in place, then the most in
    // the word elsewhere, and they made it first. Nobody, if nobody guessed.
    #closest(): string | undefined {
        let best: { id: string; marks: Marks; at: number } | undefined;
        for (const p of this.#data.players) {
            p.marks.forEach((marks, i) => {
                const at = p.at[i] ?? 0;
                const order = best === undefined ? -1 : closer(marks, best.marks) || at - best.at;
                if (order < 0) best = { id: p.id, marks, at };
            });
        }
        return best?.id;
    }

    #finish(ended: Ending, winner: string | undefined, at: number): void {
        const d = this.#data;
        d.phase = "finished";
        d.ended = ended;
        d.winner = winner;
        d.finishedAt = at;
        this.#changed();
    }

    #changed(): void {
        this.#data.rev++;
    }

    /** Each racer's own guesses while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnGuesses> | undefined {
        if (this.#data.phase !== "active") return undefined;
        return Object.fromEntries(this.#data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /** What everyone sees: each racer's marks, and, once it's over, their guesses and the word */
    shared(): SharedState {
        const d = this.#data;
        const finished = d.phase === "finished";
        const names: Record<string, string> = {};
        for (const p of [...d.seats, ...d.players]) names[p.id] = p.name;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            phase: d.phase,
            settings: this.settings(),
            host: d.host,
            hostName: d.hostName,
            seats: d.seats.map((s) => ({ ...s })),
            names,
            racers: d.players.map(({ id, marks, guesses }) =>
                finished
                    ? { id, marks: [...marks], guesses: [...guesses] }
                    : { id, marks: [...marks] },
            ),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            word: finished ? d.word : undefined,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) guessed CRANE in 48s, with 3
     * guesses", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        const word = (d.word ?? "").toUpperCase();
        if (d.winner === undefined) {
            return d.ended === "time"
                ? `Time's up! Nobody guessed ${word}`
                : `Nobody guessed ${word}`;
        }
        const who = `@UserId(${d.winner})`;
        if (d.ended === "guessed" && d.startedAt !== undefined && d.finishedAt !== undefined) {
            const tries = d.players.find((p) => p.id === d.winner)?.guesses.length ?? 0;
            return `${who} guessed ${word} in ${duration(d.finishedAt - d.startedAt)}, with ${tries} guess${tries === 1 ? "" : "es"}`;
        }
        return d.ended === "time"
            ? `Time's up! Nobody guessed ${word}, and ${who} came closest`
            : `Nobody guessed ${word}, and ${who} came closest`;
    }

    /** How the race ended is its final state: everyone's guesses, and the word */
    endState(): SharedState | undefined {
        return this.#data.phase === "finished" ? this.shared() : undefined;
    }

    toJson(): WordsData {
        return this.#data;
    }
}
