import { describe, expect, it } from "vitest";
import { parseSettings } from "../settings";
import { SECTIONS_PER_COURSE } from "./course";
import { DashRace } from "./race";
import { START_TICK } from "./runner";
import { SECTIONS } from "./sections";
import { DASH_SETTINGS } from "./settings";
import { AHEAD_TICKS, MAX_PLAYERS, type SharedState } from "./types";

const MINUTE = 60_000;

/** The count of three before everyone sets off, which the time limit is after */
const COUNT = 3000;
const S = START_TICK;

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
 * runner, off on tick `S`, crosses 60 ticks on, and section 0 has a spike to fall on, 13 tiles in
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

    it("picks a course, easy at first and harder as it goes, and everyone starts at its start", () => {
        const { race } = seated();
        race.start();
        const shared = race.shared();
        expect(shared.sections).toHaveLength(SECTIONS_PER_COURSE);
        expect(shared.sections!.map((id) => SECTIONS[id].level)).toEqual(
            [1, 2, 3, 3, 3].flatMap((level) => Array(4).fill(level)),
        );
        expect(shared.racers).toEqual([
            { id: "alice", tiles: 1, falls: 0 },
            { id: "bob", tiles: 1, falls: 0 },
        ]);
        expect(shared.endsAt).toBe(shared.startedAt! + COUNT + 3 * MINUTE);
        // The time's the only setting
        expect(parseSettings(DASH_SETTINGS, { minutes: 5 })).toMatchObject({ ok: true });
        expect(parseSettings(DASH_SETTINGS, { difficulty: 3 })).toMatchObject({ ok: false });
    });

    it("takes a racer's run, and tells everyone only how far they've got", () => {
        const { race, clock } = started([0]);
        clock.now = at(race, S + 40);
        // Thirty ticks on from the start, with a hop
        expect(send(race, "alice", [S + 2, S + 4], S + 29)).toEqual({
            result: { ok: true, own: { changes: [S + 2, S + 4], upTo: S + 29 }, now: clock.now },
            changed: true,
        });
        const shared = race.shared();
        expect(shared.racers[0]).toEqual({ id: "alice", tiles: 4, falls: 0 });
        expect(shared).not.toHaveProperty("changes");
        // Nor in a private part, which goes with every state: the racer's page asks for theirs
        expect("privateState" in race).toBe(false);
        expect(race.own("bob")).toEqual({ changes: [], upTo: -1 });
        // On from there, into the spike
        clock.now = at(race, S + 200);
        expect(send(race, "alice", [S + 2, S + 4], S + 199)).toMatchObject({ changed: true });
        expect(race.shared().racers[0]).toEqual({ id: "alice", tiles: 13, falls: 1 });
        // No run just asks for it
        expect(send(race, "alice")).toMatchObject({
            result: { ok: true, own: { changes: [S + 2, S + 4], upTo: S + 199 } },
            changed: false,
        });
        // Nobody's further on for the count
        const { race: counting } = started([0]);
        expect(send(counting, "alice", [10, 20], 30)).toMatchObject({ changed: false });
        expect(counting.shared().racers[0]).toEqual({ id: "alice", tiles: 1, falls: 0 });
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
        // But not past the race's end, however near it the clock is
        clock.now = race.data.endsAt! - 10;
        const last = ((COUNT + 3 * MINUTE) * 60) / 1000 - 1;
        expect(refused([0, 1, 45], last + 1)).toMatchObject({
            error: "That run is ahead of the race",
        });
        expect(refused([0, 1, 45], last)).toMatchObject({ ok: true });
        expect(send(race, "carol", [], 0).result).toMatchObject({
            error: "You aren't in this race",
        });
    });

    it("gives the race to the first across the finish line, and shows how", () => {
        const { race, clock } = started();
        clock.now = at(race, S + 70);
        send(race, "bob", [], S + 30);
        expect(send(race, "alice", [S + 10, S + 12], S + 70)).toMatchObject({
            result: { ok: true },
            changed: true,
        });
        expect(race.phase).toBe("finished");
        expect(race.data.players[0].finished).toBe(S + 59);
        // Timed from when everyone set off
        expect(race.result()).toBe("@UserId(alice) reached the flag in 1.0s, without a fall");
        const end = race.endState()!;
        expect(end).toMatchObject({ ended: "flag", winner: "alice", changes: [S + 10, S + 12] });
        // As the tick's over
        expect(end.finishedAt).toBe(race.data.startedAt! + COUNT + 1000);
        // Too late, and nothing changes
        expect(send(race, "bob", [], S + 60)).toMatchObject({
            result: { ok: true, own: { changes: [], upTo: S + 30 } },
            changed: false,
        });
    });

    it("gives the race, when the time's up, to whoever got furthest", () => {
        const { race, clock } = started([0]);
        clock.now = at(race, S + 200);
        // Bob into the spike, alice not so far
        send(race, "bob", [S + 5, S + 7], S + 199);
        send(race, "alice", [], S + 29);
        expect(race.shared().racers.map((r) => r.tiles)).toEqual([4, 13]);
        clock.now = race.data.startedAt! + COUNT + 3 * MINUTE;
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.data).toMatchObject({ ended: "time", winner: "bob" });
        expect(race.result()).toBe("Time's up! @UserId(bob) got furthest, 52% of the way");
        // Their run to where they got, to show
        expect((race.endState() as SharedState).changes).toEqual([S + 5, S + 7]);
    });

    it("says nobody set off when the time's up before anyone has", () => {
        const { race, clock } = started();
        clock.now += COUNT + 3 * MINUTE;
        race.endIfTimeUp();
        expect(race.data.winner).toBeUndefined();
        expect(race.result()).toBe("Time's up! Nobody set off");
    });

    it("plays a run on from where it was, the same as from the start, read back from the store", () => {
        const { race, clock } = started([0, 1, 2]);
        clock.now = at(race, S + 400);
        const on = (ticks: number[]) => ticks.map((t) => S + t);
        send(race, "alice", on([5, 20, 70, 84]), S + 100);
        send(race, "alice", on([5, 20, 70, 84, 150, 160]), S + 200);
        const back = new DashRace(JSON.parse(JSON.stringify(race.toJson())), {
            now: () => clock.now,
        });
        expect(back.shared()).toEqual(race.shared());
        const changes = on([5, 20, 70, 84, 150, 160, 230, 245]);
        send(race, "alice", changes, S + 380);
        send(back, "alice", changes, S + 380);
        expect(back.data.players[0]).toEqual(race.data.players[0]);
        // And the clock doesn't run while the bot was down
        const endsAt = back.data.endsAt!;
        expect(back.resume(5000)).toBe(true);
        expect(back.data.endsAt).toBe(endsAt + 5000);
    });
});
