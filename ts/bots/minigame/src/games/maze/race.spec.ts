import { describe, expect, it } from "vitest";
import { duration } from "../race2048/race";
import { canMove, carve, DIRECTIONS, stepsOut, wayOut, type Direction } from "./maze";
import { MazeRace, type MazeData } from "./race";
import { MAX_PLAYERS } from "./types";

const MINUTE = 60_000;

/** A race with alice and bob seated, on a clock the test moves */
function seated(options: { host?: string } = {}) {
    const clock = { now: 1_000_000 };
    const race = MazeRace.create({
        now: () => clock.now,
        random: () => 0.25,
        host: options.host === undefined ? undefined : { id: options.host, name: "Host" },
    });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    return { race, clock };
}

function started() {
    const s = seated();
    s.race.start();
    return s;
}

/** A direction out of the top-left cell that's walled */
function walled(race: MazeRace): Direction {
    return (Object.keys(DIRECTIONS) as Direction[]).find((d) => !canMove(race.maze!, 0, 0, d))!;
}

describe("a maze race", () => {
    it("seats up to ten, and frees a seat left before the start", () => {
        const race = MazeRace.create();
        for (let i = 0; i < MAX_PLAYERS; i++) expect(race.join(`p${i}`, `P${i}`)).toBeUndefined();
        expect(race.join("late", "Late")).toBe("All 10 places are taken");
        expect(race.leave("p3")).toBe(true);
        expect(race.isSeated("p3")).toBe(false);
        expect(MazeRace.create().cannotStart()).toBe("Nobody has joined yet");
    });

    it("starts everyone in the top-left cell of a maze from a new seed, with the clock running", () => {
        const { race, clock } = seated();
        const before = race.shared().rev;
        expect(race.start()).toEqual(["alice", "bob"]);
        const shared = race.shared();
        expect(shared).toMatchObject({
            phase: "active",
            size: 15,
            seed: Math.floor(0.25 * 2 ** 31),
            startedAt: clock.now,
            endsAt: clock.now + 3 * MINUTE,
            seats: [],
            names: { alice: "Alice", bob: "Bob" },
        });
        expect(shared.racers).toEqual([
            { id: "alice", x: 0, y: 0, ack: 0, moves: 0 },
            { id: "bob", x: 0, y: 0, ack: 0, moves: 0 },
        ]);
        expect(shared.rev).toBeGreaterThan(before);
        expect(race.isPlayer("alice")).toBe(true);
        expect(race.join("carol", "Carol")).toBe("The race has started");
        expect(race.waitingFor()).toEqual([]);
    });

    it("takes each move once, checking it against the walls", () => {
        const { race } = started();
        const [first] = wayOut(race.maze!);
        expect(race.receive("alice", { move: first, n: 1 })).toEqual({ ok: true, changed: true });
        expect(race.shared().racers[0]).toMatchObject({ ack: 1, moves: 1 });
        // Sent again, eg. over HTTP after the socket took it: nothing more
        expect(race.receive("alice", { move: first, n: 1 })).toEqual({ ok: true, changed: false });
        // Into a wall: refused, but counted as taken, so the page drops it
        const back = { up: "down", down: "up", left: "right", right: "left" }[first] as Direction;
        const rev = race.shared().rev;
        const wall = (Object.keys(DIRECTIONS) as Direction[]).find(
            (d) =>
                d !== back &&
                !canMove(race.maze!, race.shared().racers[0].x, race.shared().racers[0].y, d),
        )!;
        expect(race.receive("alice", { move: wall, n: 2 })).toEqual({
            ok: false,
            error: "There's a wall that way",
            changed: true,
        });
        expect(race.shared().racers[0]).toMatchObject({ ack: 2, moves: 1 });
        expect(race.shared().rev).toBe(rev + 1);
    });

    it("refuses what isn't a racer's move", () => {
        const open = seated().race;
        expect(open.receive("alice", { move: "up", n: 1 })).toMatchObject({
            ok: false,
            error: "The race hasn't started",
        });
        const { race } = started();
        expect(race.receive("carol", { move: "up", n: 1 })).toMatchObject({
            error: "You aren't in this race",
        });
        for (const bad of [
            undefined,
            {},
            { move: "north", n: 1 },
            { move: "up" },
            { move: "up", n: 0 },
        ]) {
            expect(race.receive("alice", bad)).toEqual({
                ok: false,
                error: "A move is a direction and its number",
                changed: false,
            });
        }
        expect(walled(race)).toBeDefined();
    });

    it("ends when someone gets out, naming them by user id on the card", () => {
        const { race, clock } = started();
        const path = wayOut(race.maze!);
        path.forEach((move, i) => {
            clock.now += 100;
            expect(race.receive("bob", { move, n: i + 1 }).ok).toBe(true);
        });
        expect(race.phase).toBe("finished");
        expect(race.shared()).toMatchObject({ ended: "out", winner: "bob", finishedAt: clock.now });
        expect(race.result()).toBe(`@UserId(bob) got out in ${duration(path.length * 100)}`);
        expect(race.receive("alice", { move: path[0], n: 1 })).toMatchObject({
            error: "The race is over",
        });
        expect(race.endState()).toEqual(race.shared());
    });

    it("gives the race to whoever's closest to the way out when the time's up", () => {
        const { race, clock } = started();
        const path = wayOut(race.maze!);
        // Alice gets three steps along, bob one
        path.slice(0, 3).forEach((move, i) => race.receive("alice", { move, n: i + 1 }));
        race.receive("bob", { move: path[0], n: 1 });
        clock.now += 3 * MINUTE - 1;
        expect(race.endIfTimeUp()).toBe(false);
        clock.now += 1;
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.shared()).toMatchObject({ ended: "time", winner: "alice" });
        expect(stepsOut(race.maze!, race.shared().racers[0].x, race.shared().racers[0].y)).toBe(
            stepsOut(race.maze!, 0, 0) - 3,
        );
        expect(race.result()).toBe("Time's up! @UserId(alice) got closest to the way out");
    });

    it("doesn't run the clock while the bot was down", () => {
        const { race, clock } = started();
        expect(race.resume(MINUTE)).toBe(true);
        clock.now += 3 * MINUTE + 1;
        expect(race.endIfTimeUp()).toBe(false);
    });

    it("lets only the host change the settings, and only before the start", () => {
        const { race } = seated({ host: "alice" });
        expect(race.configure("bob", { size: 21 })).toMatchObject({ ok: false });
        expect(race.configure("alice", { size: 21 })).toEqual({ ok: true });
        race.start();
        expect(race.maze!.size).toBe(21);
        expect(race.configure("alice", { size: 11 })).toMatchObject({ ok: false });
    });

    it("comes back from the store as it was, with the same maze", () => {
        const { race } = started();
        race.receive("alice", { move: wayOut(race.maze!)[0], n: 1 });
        const copy = new MazeRace(JSON.parse(JSON.stringify(race.toJson())) as MazeData);
        expect(copy.shared()).toEqual(race.shared());
        expect(copy.maze!.open).toEqual(carve(15, race.shared().seed!).open);
    });
});
