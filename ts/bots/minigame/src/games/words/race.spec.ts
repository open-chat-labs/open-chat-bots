import { describe, expect, it } from "vitest";
import { WordRace } from "./race";
import { MAX_PLAYERS, TRIES } from "./types";
import { ANSWERS } from "./words";

const MINUTE = 60_000;

/** A race with alice and bob seated, on a clock the test moves */
function seated() {
    const clock = { now: 1_000_000 };
    const race = WordRace.create({ now: () => clock.now, random: () => 0.5 });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    return { race, clock };
}

/** The race started, its word "crane" */
function started() {
    const s = seated();
    s.race.start();
    s.race.data.word = "crane";
    return s;
}

/** Answers with none of crane's letters, which are marked 00000 */
const MISSES = ANSWERS.filter((w) => !/[crane]/.test(w));

describe("a Word Race", () => {
    it("seats up to twenty, and frees a seat left before the start", () => {
        const race = WordRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(race.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(race.join("late", "Late")).toBe("All 20 places are taken");
        expect(race.leave("p3")).toBe(true);
        expect(race.isSeated("p3")).toBe(false);
        expect(WordRace.create().cannotStart()).toBe("Nobody has joined yet");
    });

    it("picks a word from the answers, and keeps it and everyone's letters to itself", () => {
        const { race, clock } = seated();
        expect(race.start()).toEqual(["alice", "bob"]);
        expect(race.data.word).toBe(ANSWERS[Math.floor(ANSWERS.length / 2)]);
        race.data.word = "crane";
        const answer = race.guess("alice", { guess: "TRACE" });
        expect(answer).toEqual({
            result: { ok: true, own: { guesses: ["trace"], marks: ["02212"] } },
            changed: true,
        });
        const shared = race.shared();
        expect(shared).toMatchObject({
            phase: "active",
            startedAt: clock.now,
            endsAt: clock.now + 3 * MINUTE,
            names: { alice: "Alice", bob: "Bob" },
            racers: [
                { id: "alice", marks: ["02212"] },
                { id: "bob", marks: [] },
            ],
        });
        // Only the marks: neither the word nor anyone's guesses
        expect(shared.word).toBeUndefined();
        expect(JSON.stringify(shared)).not.toMatch(/trace|crane/);
        // Each racer's own guesses go to them alone
        expect(race.privateState()).toEqual({
            alice: { guesses: ["trace"], marks: ["02212"] },
            bob: { guesses: [], marks: [] },
        });
    });

    it("refuses a guess that isn't a word, or one made already, without counting it", () => {
        const { race } = started();
        const refused = (guess: unknown) => race.guess("alice", { guess }).result;
        expect(refused("cran")).toMatchObject({
            ok: false,
            error: "A guess is a word of 5 letters",
        });
        expect(refused(12345)).toMatchObject({ ok: false });
        expect(refused("qxzvj")).toMatchObject({ ok: false, error: "That isn't in the word list" });
        race.guess("alice", { guess: "lumpy" });
        expect(refused("lumpy")).toMatchObject({ ok: false, error: "You've guessed that already" });
        expect(race.own("alice")!.guesses).toEqual(["lumpy"]);
        // No guess at all asks for the racer's guesses, and changes nothing
        expect(race.guess("alice", {})).toEqual({
            result: { ok: true, own: { guesses: ["lumpy"], marks: ["00000"] } },
            changed: false,
        });
        expect(race.guess("carol", { guess: "lumpy" }).result).toMatchObject({
            error: "You aren't in this race",
        });
    });

    it("gives the race to the first to guess the word, and then tells everyone", () => {
        const { race, clock } = started();
        race.guess("bob", { guess: "lumpy" });
        clock.now += 48_000;
        race.guess("alice", { guess: "trace" });
        expect(race.guess("alice", { guess: "crane" }).result).toMatchObject({ ok: true });
        expect(race.phase).toBe("finished");
        expect(race.result()).toBe("@UserId(alice) guessed CRANE in 48s, with 2 guesses");
        const end = race.endState()!;
        expect(end).toMatchObject({ ended: "guessed", winner: "alice", word: "crane" });
        expect(end.racers.map((r) => r.guesses)).toEqual([["trace", "crane"], ["lumpy"]]);
        expect(race.privateState()).toBeUndefined();
        expect(race.guess("bob", { guess: "crane" }).result).toMatchObject({
            error: "The race is over",
        });
    });

    it("gives the race to whoever came closest, once everyone's had all their guesses", () => {
        const { race, clock } = started();
        for (let i = 0; i < TRIES; i++) {
            clock.now += 1000;
            race.guess("alice", { guess: MISSES[i] });
            // Bob's last guess, "cabin", has c in place, and a and n elsewhere
            race.guess("bob", { guess: i < TRIES - 1 ? MISSES[TRIES + i] : "cabin" });
            if (i < TRIES - 1) expect(race.phase).toBe("active");
        }
        expect(race.data).toMatchObject({ phase: "finished", ended: "out", winner: "bob" });
        expect(race.result()).toBe("Nobody guessed CRANE, and @UserId(bob) came closest");
    });

    it("refuses a racer more guesses than they have", () => {
        const { race } = started();
        for (let i = 0; i < TRIES; i++) race.guess("alice", { guess: MISSES[i] });
        expect(race.guess("alice", { guess: "trace" }).result).toMatchObject({
            error: "You've had all your guesses",
        });
        expect(race.phase).toBe("active");
    });

    it("gives a tie for the closest to whoever got there first, when the time's up", () => {
        const { race, clock } = started();
        // Both with c and r in place, and nothing else of the word
        clock.now += 1000;
        race.guess("bob", { guess: "crush" });
        clock.now += 1000;
        race.guess("alice", { guess: "crypt" });
        expect(race.endIfTimeUp()).toBe(false);
        clock.now += 3 * MINUTE;
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.data).toMatchObject({ ended: "time", winner: "bob" });
        expect(race.result()).toBe(
            "Time's up! Nobody guessed CRANE, and @UserId(bob) came closest",
        );
    });

    it("says nobody guessed it when the time's up before anyone has", () => {
        const { race, clock } = started();
        clock.now += 3 * MINUTE;
        race.endIfTimeUp();
        expect(race.data.winner).toBeUndefined();
        expect(race.result()).toBe("Time's up! Nobody guessed CRANE");
    });

    it("doesn't run the clock while the bot was down, and reads itself back from the store", () => {
        const { race, clock } = started();
        const endsAt = race.data.endsAt!;
        expect(race.resume(5000)).toBe(true);
        expect(race.data.endsAt).toBe(endsAt + 5000);
        race.guess("alice", { guess: "lumpy" });
        const back = new WordRace(JSON.parse(JSON.stringify(race.toJson())), {
            now: () => clock.now,
        });
        expect(back.own("alice")).toEqual(race.own("alice"));
        expect(back.shared()).toEqual(race.shared());
    });
});
