import { describe, expect, it } from "vitest";
import { EASY_LEVELS, HARD_LEVELS } from "./levels";
import { CrateRace } from "./race";
import { LEVEL, SOLUTION } from "./sample";
import { EASY, HARD } from "./settings";
import { MAX_PATH, MAX_PLAYERS } from "./types";

const MINUTE = 60_000;

/** A race with alice and bob seated, on a clock the test moves */
function seated(settings = {}) {
    const clock = { now: 1_000_000 };
    const race = CrateRace.create({ now: () => clock.now, random: () => 0, settings });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    return { race, clock };
}

/** The race started on the small level of the board's tests */
function started() {
    const s = seated();
    s.race.start();
    s.race.data.level = LEVEL;
    s.race.data.par = 5;
    return s;
}

const send = (race: CrateRace, userId: string, path?: string) =>
    race.path(userId, path === undefined ? {} : { path });

describe("a Crate Race", () => {
    it("seats up to twenty, and frees a seat left before the start", () => {
        const race = CrateRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(race.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(race.join("late", "Late")).toBe("All 20 places are taken");
        expect(race.leave("p3")).toBe(true);
        expect(race.isSeated("p3")).toBe(false);
        expect(CrateRace.create().cannotStart()).toBe("Nobody has joined yet");
    });

    it("picks a level of the difficulty the host set, and everyone starts on it", () => {
        const easy = seated({ difficulty: EASY }).race;
        easy.start();
        const [code, par] = EASY_LEVELS[0].split(" ");
        expect(easy.shared()).toMatchObject({ phase: "active", level: code, par: Number(par) });
        const hard = seated({ difficulty: HARD }).race;
        hard.start();
        expect(hard.shared().level).toBe(HARD_LEVELS[0].split(" ")[0]);
        expect(hard.shared().racers).toEqual([
            { id: "alice", placed: 0, pushes: 0 },
            { id: "bob", placed: 0, pushes: 0 },
        ]);
        expect(hard.shared().endsAt).toBe(hard.shared().startedAt! + 5 * MINUTE);
    });

    it("takes a racer's path, and tells everyone only how far they've got", () => {
        const { race } = started();
        expect(send(race, "alice", "rrr")).toEqual({
            result: { ok: true, own: { path: "rrr" } },
            changed: true,
        });
        const shared = race.shared();
        expect(shared.racers[0]).toEqual({ id: "alice", placed: 1, pushes: 2 });
        expect(JSON.stringify(shared)).not.toContain("rrr");
        expect(race.privateState()).toEqual({ alice: { path: "rrr" }, bob: { path: "" } });
        // Walking about changes nothing the others see, so it isn't published
        expect(send(race, "alice", "rrrd").changed).toBe(false);
        // Undoing is a shorter path: the push undone is published
        expect(send(race, "alice", "rr")).toMatchObject({ changed: true });
        expect(race.shared().racers[0]).toEqual({ id: "alice", placed: 0, pushes: 1 });
    });

    it("refuses a path with a move that can't be made, keeping the one it had", () => {
        const { race } = started();
        send(race, "alice", "rr");
        expect(send(race, "alice", "rru").result).toEqual({
            ok: false,
            error: "One of those moves can't be made",
            own: { path: "rr" },
        });
        expect(send(race, "alice", "rrx").result).toMatchObject({ ok: false, own: { path: "rr" } });
        expect(send(race, "alice", "r".repeat(MAX_PATH + 1)).result).toMatchObject({ ok: false });
        // No path just asks for it
        expect(send(race, "alice")).toEqual({
            result: { ok: true, own: { path: "rr" } },
            changed: false,
        });
        expect(send(race, "carol", "r").result).toMatchObject({ error: "You aren't in this race" });
    });

    it("gives the race to the first to put every crate on a goal, and shows how", () => {
        const { race, clock } = started();
        send(race, "bob", "rrr");
        clock.now += 48_000;
        expect(send(race, "alice", SOLUTION)).toMatchObject({
            result: { ok: true },
            changed: true,
        });
        expect(race.phase).toBe("finished");
        expect(race.result()).toBe(
            "@UserId(alice) put every crate on a goal in 48s, with 5 pushes",
        );
        const end = race.endState()!;
        expect(end).toMatchObject({ ended: "solved", winner: "alice", path: SOLUTION });
        // Where everyone's crates ended up, and they did
        expect(end.racers[1]).toMatchObject({ id: "bob", placed: 1, crates: [13, 26], player: 12 });
        expect(race.privateState()).toBeUndefined();
        expect(send(race, "bob", "rrrd").result).toMatchObject({ error: "The race is over" });
    });

    it("gives the race, when the time's up, to whoever has the most crates on goals longest", () => {
        const { race, clock } = started();
        clock.now += 1000;
        send(race, "bob", "rrr");
        clock.now += 1000;
        send(race, "alice", "rrr");
        expect(race.endIfTimeUp()).toBe(false);
        clock.now += 5 * MINUTE;
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.data).toMatchObject({ ended: "time", winner: "bob" });
        expect(race.result()).toBe("Time's up! @UserId(bob) put the most crates on goals, 1 of 2");
    });

    it("says nobody put a crate on a goal when the time's up before anyone has", () => {
        const { race, clock } = started();
        send(race, "alice", "rr");
        clock.now += 5 * MINUTE;
        race.endIfTimeUp();
        expect(race.data.winner).toBeUndefined();
        expect(race.result()).toBe("Time's up! Nobody put a crate on a goal");
    });

    it("doesn't run the clock while the bot was down, and reads itself back from the store", () => {
        const { race, clock } = started();
        const endsAt = race.data.endsAt!;
        expect(race.resume(5000)).toBe(true);
        expect(race.data.endsAt).toBe(endsAt + 5000);
        send(race, "alice", "rrr");
        const back = new CrateRace(JSON.parse(JSON.stringify(race.toJson())), {
            now: () => clock.now,
        });
        expect(back.own("alice")).toEqual({ path: "rrr" });
        expect(back.shared()).toEqual(race.shared());
        expect(send(back, "alice", SOLUTION).result).toMatchObject({ ok: true });
        expect(back.phase).toBe("finished");
    });
});
