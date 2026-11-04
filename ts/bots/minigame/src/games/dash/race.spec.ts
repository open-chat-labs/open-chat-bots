import { describe, expect, it } from "vitest";
import { SECTIONS_PER_COURSE } from "./course";
import { DashRace } from "./race";
import { SECTIONS } from "./sections";
import { EASY, HARD } from "./settings";
import { AHEAD_TICKS, MAX_PLAYERS, type SharedState } from "./types";

const MINUTE = 60_000;

/** A race with alice and bob seated, on a clock the test moves */
function seated(settings = {}) {
    const clock = { now: 1_000_000 };
    const race = DashRace.create({ now: () => clock.now, random: () => 0, settings });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    return { race, clock };
}

/**
 * The race started on a course of these sections: none is just the flat start and finish, which a
 * runner set off on tick 0 crosses on tick 60, and section 0 has a spike to fall on, 13 tiles in
 */
function started(sections: number[] = []) {
    const s = seated();
    s.race.start();
    s.race.data.sections = sections;
    return s;
}

/** The clock at a tick of the race */
const at = (race: DashRace, tick: number) => race.data.startedAt! + Math.ceil((tick * 1000) / 60);

const send = (race: DashRace, userId: string, changes?: number[], upTo?: number) =>
    race.run(userId, changes === undefined ? {} : { changes, upTo });

describe("a Dash Race", () => {
    it("seats up to twenty, and frees a seat left before the start", () => {
        const race = DashRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(race.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(race.join("late", "Late")).toBe("All 20 places are taken");
        expect(race.leave("p3")).toBe(true);
        expect(race.isSeated("p3")).toBe(false);
    });

    it("picks a course of the difficulty the host set, and everyone starts at its start", () => {
        const easy = seated({ difficulty: EASY }).race;
        easy.start();
        const shared = easy.shared();
        expect(shared.sections).toHaveLength(SECTIONS_PER_COURSE);
        expect(shared.sections!.every((id) => SECTIONS[id].level === 1)).toBe(true);
        expect(shared.racers).toEqual([
            { id: "alice", tiles: 1, falls: 0 },
            { id: "bob", tiles: 1, falls: 0 },
        ]);
        expect(shared.endsAt).toBe(shared.startedAt! + 3 * MINUTE);
        const hard = seated({ difficulty: HARD }).race;
        hard.start();
        expect(
            hard
                .shared()
                .sections!.slice(4)
                .every((id) => SECTIONS[id].level === 3),
        ).toBe(true);
    });

    it("takes a racer's run, and tells everyone only how far they've got", () => {
        const { race, clock } = started([0]);
        clock.now = at(race, 40);
        expect(send(race, "alice", [0, 1], 30)).toEqual({
            result: { ok: true, own: { changes: [0, 1], upTo: 30 }, now: clock.now },
            changed: true,
        });
        const shared = race.shared();
        expect(shared.racers[0]).toEqual({ id: "alice", tiles: 4, falls: 0 });
        expect(shared).not.toHaveProperty("changes");
        expect(race.privateState()).toEqual({
            alice: { changes: [0, 1], upTo: 30 },
            bob: { changes: [], upTo: -1 },
        });
        // On from there, into the spike
        clock.now = at(race, 200);
        expect(send(race, "alice", [0, 1], 200)).toMatchObject({ changed: true });
        expect(race.shared().racers[0]).toEqual({ id: "alice", tiles: 13, falls: 1 });
        // No run just asks for it
        expect(send(race, "alice")).toMatchObject({
            result: { ok: true, own: { changes: [0, 1], upTo: 200 } },
            changed: false,
        });
    });

    it("refuses a run that isn't how the racer's went, or is ahead of the race", () => {
        const { race, clock } = started([0]);
        clock.now = at(race, 60);
        send(race, "alice", [0, 1], 40);
        const refused = (changes: number[], upTo: number) =>
            send(race, "alice", changes, upTo).result;
        expect(refused([0, 2], 50)).toMatchObject({
            ok: false,
            error: "That isn't how your run went",
            own: { changes: [0, 1], upTo: 40 },
        });
        expect(refused([0, 1, 30], 50)).toMatchObject({ error: "That isn't how your run went" });
        expect(refused([0, 1], 39)).toMatchObject({ error: "That isn't how your run went" });
        expect(refused([0, 1, 55], 50)).toMatchObject({
            error: "That run has a change after its tick",
        });
        expect(refused([0, 1], 60 + AHEAD_TICKS + 1)).toMatchObject({
            error: "That run is ahead of the race",
        });
        expect(refused([1, 0], 50)).toMatchObject({ ok: false });
        // What a page that's played on sends: the same, and more
        expect(refused([0, 1, 45], 60 + AHEAD_TICKS)).toMatchObject({ ok: true });
        expect(send(race, "carol", [], 0).result).toMatchObject({
            error: "You aren't in this race",
        });
    });

    it("gives the race to the first across the finish line, and shows how", () => {
        const { race, clock } = started();
        clock.now = at(race, 70);
        send(race, "bob", [10], 30);
        expect(send(race, "alice", [0], 70)).toMatchObject({ result: { ok: true }, changed: true });
        expect(race.phase).toBe("finished");
        expect(race.data.players[0].finished).toBe(60);
        expect(race.result()).toBe("@UserId(alice) reached the flag in 1.0s, without a fall");
        const end = race.endState()!;
        expect(end).toMatchObject({ ended: "flag", winner: "alice", changes: [0] });
        // As the tick's over
        expect(end.finishedAt).toBe(race.data.startedAt! + 1017);
        expect(race.privateState()).toBeUndefined();
        // Too late, and nothing changes
        expect(send(race, "bob", [10], 60)).toMatchObject({
            result: { ok: true, own: { changes: [10], upTo: 30 } },
            changed: false,
        });
    });

    it("gives the race, when the time's up, to whoever got furthest first", () => {
        const { race, clock } = started([0]);
        clock.now = at(race, 200);
        // Both into the spike, alice a tick later off the start
        send(race, "bob", [0], 200);
        send(race, "alice", [1], 200);
        expect(race.shared().racers.map((r) => r.tiles)).toEqual([13, 13]);
        clock.now += 3 * MINUTE;
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.data).toMatchObject({ ended: "time", winner: "bob" });
        expect(race.result()).toBe("Time's up! @UserId(bob) got furthest, 52% of the way");
        // Their run to where they got, to show
        expect((race.endState() as SharedState).changes).toEqual([0]);
    });

    it("says nobody set off when the time's up before anyone has", () => {
        const { race, clock } = started();
        clock.now += 3 * MINUTE;
        race.endIfTimeUp();
        expect(race.data.winner).toBeUndefined();
        expect(race.result()).toBe("Time's up! Nobody set off");
    });

    it("plays a run on from where it was, the same as from the start, read back from the store", () => {
        const { race, clock } = started([0, 1, 2]);
        clock.now = at(race, 400);
        send(race, "alice", [5, 20, 70, 84], 100);
        send(race, "alice", [5, 20, 70, 84, 150, 160], 200);
        const back = new DashRace(JSON.parse(JSON.stringify(race.toJson())), {
            now: () => clock.now,
        });
        expect(back.shared()).toEqual(race.shared());
        const changes = [5, 20, 70, 84, 150, 160, 230, 245];
        send(race, "alice", changes, 380);
        send(back, "alice", changes, 380);
        expect(back.data.players[0]).toEqual(race.data.players[0]);
        // And the clock doesn't run while the bot was down
        const endsAt = back.data.endsAt!;
        expect(back.resume(5000)).toBe(true);
        expect(back.data.endsAt).toBe(endsAt + 5000);
    });
});
