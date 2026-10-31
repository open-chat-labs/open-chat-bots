import { describe, expect, it } from "vitest";
import type { Settings } from "../settings";
import { duration, publishEveryMs, Race2048 } from "./race";
import { DEAD, MAX_PLAYERS, STATE_VERSION, TARGET, TIME_LIMIT_MS, WON } from "./types";

// Spawns always put a 2 in the first empty cell
const first2 = () => 0;

function clock(start = 1_000_000) {
    let now = start;
    return { now: () => now, tick: (ms: number) => (now += ms) };
}

function started(names = ["alice", "bob"], settings?: Settings) {
    const time = clock();
    const race = Race2048.create({
        random: first2,
        now: time.now,
        settings,
        host: { id: "alice", name: "ALICE" },
    });
    names.forEach((name) => race.takeSeat(name, name.toUpperCase()));
    race.start();
    return { race, time };
}

describe("seats", () => {
    it("seats up to the limit, once each, until the race starts", () => {
        const race = Race2048.create({ random: first2 });
        for (let i = 0; i < MAX_PLAYERS; i++) {
            expect(race.takeSeat(`u${i}`, `U${i}`)).toBe("seated");
        }
        expect(race.takeSeat("u0", "U0")).toBe("already_seated");
        expect(race.takeSeat("late", "Late")).toBe("full");
        expect(race.leaveSeat("u3")).toBe(true);
        expect(race.leaveSeat("u3")).toBe(false);
        expect(race.takeSeat("late", "Late")).toBe("seated");
        race.start();
        expect(race.takeSeat("later", "Later")).toBe("started");
        expect(race.isPlayer("late")).toBe(true);
        expect(race.isPlayer("u3")).toBe(false);
    });

    it("can't start with nobody seated", () => {
        const race = Race2048.create();
        expect(race.cannotStart()).toBe("Nobody has joined yet");
        race.takeSeat("a", "A");
        expect(race.cannotStart()).toBeUndefined();
    });
});

describe("start", () => {
    it("gives everyone seated a board with two tiles, and starts the clock", () => {
        const { race, time } = started();
        expect(race.phase).toBe("active");
        expect(race.seats).toEqual([]);
        expect(race.players.map((p) => p.id)).toEqual(["alice", "bob"]);
        race.players.forEach((p) => {
            expect(p.board.filter((v) => v !== 0)).toHaveLength(2);
            expect(p.score).toBe(0);
        });
        expect(race.data.startedAt).toBe(time.now());
        expect(race.data.endsAt).toBe(time.now() + TIME_LIMIT_MS);
        // Seated players aren't players until the race starts
        expect(race.isPlayer("alice")).toBe(true);
    });

    it("starting again changes nothing and gives the same players", () => {
        const { race } = started();
        const boards = race.players.map((p) => p.board.slice());
        expect(race.start()).toEqual(["alice", "bob"]);
        expect(race.players.map((p) => p.board)).toEqual(boards);
    });
});

describe("moves", () => {
    it("applies a move, spawns a tile and keeps score", () => {
        const { race } = started();
        // With first2, the two starting tiles are in cells 0 and 1: [2, 2, 0, 0, ...]
        const result = race.move("alice", "left");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.gained).toBe(4);
        expect(result.moved).toBe(true);
        expect(result.player.board.slice(0, 4)).toEqual([4, 2, 0, 0]);
        expect(result.player.score).toBe(4);
        expect(result.player.best).toBe(4);
        expect(race.data.players[0].moves).toBe(1);
        expect(result.player.rev).toBe(1);
        expect(race.data.lastMove).toEqual({ player: "alice", direction: "left" });
    });

    it("spawns nothing for a move that changes nothing", () => {
        const { race } = started();
        const result = race.move("alice", "up");
        expect(result).toMatchObject({ ok: true, moved: false, gained: 0 });
        if (!result.ok) return;
        expect(result.player.board.filter((v) => v !== 0)).toHaveLength(2);
        expect(race.data.players[0].moves).toBe(0);
    });

    it("refuses a move from someone not racing, before the start, or with no direction", () => {
        const race = Race2048.create({ random: first2 });
        race.takeSeat("alice", "ALICE");
        expect(race.move("alice", "left")).toEqual({ ok: false, error: "The race hasn't started" });
        race.start();
        expect(race.move("carol", "left")).toEqual({ ok: false, error: "You aren't in this race" });
        expect(race.move("alice", "sideways")).toEqual({ ok: false, error: "Not a direction" });
    });

    it("ends the race when a player makes the target tile", () => {
        const { race, time } = started();
        const alice = race.data.players[0];
        alice.board = [
            ...[TARGET / 2, TARGET / 2, 0, 0],
            ...[0, 0, 0, 0],
            ...[0, 0, 0, 0],
            ...[0, 0, 0, 0],
        ];
        time.tick(135_000);
        const result = race.move("alice", "left");
        expect(result).toMatchObject({ ok: true, phase: "finished" });
        expect(race.phase).toBe("finished");
        expect(race.data.ended).toBe("target");
        expect(race.winner?.id).toBe("alice");
        expect(race.players[0].won).toBe(true);
        expect(race.result()).toBe(`@UserId(alice) reached ${TARGET} in 2m 15s`);
        expect(race.move("bob", "left")).toEqual({ ok: false, error: "The race is over" });
        expect(race.restart("bob")).toEqual({ ok: false, error: "The race is over" });
    });

    it("marks a stuck board dead, and a restart gives a fresh one, keeping the best score", () => {
        const { race } = started();
        const bob = race.data.players[1];
        bob.score = 48;
        bob.best = 48;
        // One move from stuck: sliding left makes the last row 4 2 4 0, the spawn fills the last
        // cell with a 2, and no two neighbours match
        bob.board = [
            ...[2, 4, 2, 4],
            ...[4, 2, 4, 2],
            ...[2, 4, 2, 4],
            ...[0, 4, 2, 4],
        ];
        const result = race.move("bob", "left");
        expect(result).toMatchObject({ ok: true, moved: true });
        if (!result.ok) return;
        expect(result.player.dead).toBe(true);
        expect(race.move("bob", "left")).toEqual({
            ok: false,
            error: "Your board is stuck. Restart to keep racing.",
        });

        const restarted = race.restart("bob");
        expect(restarted.ok).toBe(true);
        if (!restarted.ok) return;
        expect(restarted.player.dead).toBe(false);
        expect(restarted.player.restarts).toBe(1);
        expect(restarted.player.score).toBe(0);
        // The move that got stuck merged nothing, so the best is the score before it
        expect(restarted.player.best).toBe(48);
        expect(race.data.players[1].moves).toBe(0);
        expect(restarted.player.rev).toBe(2);
        expect(restarted.player.board.filter((v) => v !== 0)).toHaveLength(2);
    });
});

describe("time limit", () => {
    it("ends the race with the top score of any board once the time is up", () => {
        const { race, time } = started(["alice", "bob", "carol"]);
        // Alice's current board is ahead, but Bob's best, before a restart, is the top score
        race.data.players[0].score = 1200;
        race.data.players[0].best = 1200;
        race.data.players[1].score = 50;
        race.data.players[1].best = 5432;
        race.data.players[1].restarts = 1;
        race.data.players[2].score = 300;
        race.data.players[2].best = 300;
        time.tick(TIME_LIMIT_MS - 1);
        expect(race.endIfTimeUp()).toBe(false);
        expect(race.phase).toBe("active");
        time.tick(1);
        expect(race.endIfTimeUp()).toBe(true);
        expect(race.phase).toBe("finished");
        expect(race.data.ended).toBe("time");
        expect(race.data.finishedAt).toBe(time.now());
        expect(race.winner?.id).toBe("bob");
        expect(race.players[1].won).toBe(true);
        expect(race.players[0].won).toBe(false);
        expect(race.result()).toBe("Time's up! @UserId(bob) won with 5,432 points");
        // Only the once
        expect(race.endIfTimeUp()).toBe(false);
        expect(race.move("alice", "left")).toEqual({ ok: false, error: "The race is over" });
        expect(race.restart("alice")).toEqual({ ok: false, error: "The race is over" });
    });

    it("breaks a tie on the best score by the current one, the higher tile, then the fewer restarts", () => {
        const { race, time } = started(["alice", "bob", "carol"]);
        for (const p of race.data.players) {
            p.score = 100;
            p.best = 100;
            p.board = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8];
        }
        // Bob's higher tile beats Carol's fewer restarts
        race.data.players[0].restarts = 2;
        race.data.players[1].restarts = 1;
        race.data.players[1].board[0] = 16;
        time.tick(TIME_LIMIT_MS);
        race.endIfTimeUp();
        expect(race.winner?.id).toBe("bob");

        // With the same tiles, the fewer restarts win
        const again = started(["alice", "bob"]);
        for (const p of again.race.data.players) p.best = 100;
        again.race.data.players[0].restarts = 1;
        again.time.tick(TIME_LIMIT_MS);
        again.race.endIfTimeUp();
        expect(again.race.winner?.id).toBe("bob");

        // A better current score breaks the tie before the tile does
        const third = started(["alice", "bob"]);
        for (const p of third.race.data.players) p.best = 100;
        third.race.data.players[1].score = 100;
        third.race.data.players[0].board[0] = 64;
        third.time.tick(TIME_LIMIT_MS);
        third.race.endIfTimeUp();
        expect(third.race.winner?.id).toBe("bob");
    });

    it("a move or restart after the time is up ends the race instead", () => {
        const { race, time } = started(undefined, { minutes: 1 });
        expect(race.timeLimit).toBe(60_000);
        expect(race.shared()).toMatchObject({
            settings: { target: TARGET, minutes: 1 },
            timeLimit: 60_000,
            endsAt: race.data.startedAt! + 60_000,
        });
        time.tick(60_000);
        expect(race.move("alice", "left")).toEqual({ ok: false, error: "The race is over" });
        expect(race.phase).toBe("finished");
        expect(race.data.ended).toBe("time");
        expect(race.result()).toBe("Time's up! @UserId(alice) won with 0 points");
    });
});

describe("settings", () => {
    it("are the defaults unless chosen, and the host changes them while the race is open", () => {
        const race = Race2048.create({
            settings: { target: 512 },
            host: { id: "alice", name: "ALICE" },
        });
        expect(race.settings()).toEqual({ target: 512, minutes: 10 });
        expect(race.target).toBe(512);
        expect(race.timeLimit).toBe(TIME_LIMIT_MS);
        expect(race.shared()).toMatchObject({
            settings: { target: 512, minutes: 10 },
            host: "alice",
            hostName: "ALICE",
        });

        expect(race.configure("bob", { minutes: 5 })).toEqual({
            ok: false,
            error: "Only the host can change the settings",
        });
        expect(race.configure("alice", { minutes: 5 })).toEqual({ ok: true });
        expect(race.settings()).toEqual({ target: 512, minutes: 5 });
        expect(race.timeLimit).toBe(5 * 60_000);

        race.takeSeat("alice", "ALICE");
        race.start();
        expect(race.configure("alice", { target: 256 })).toEqual({
            ok: false,
            error: "The race has started",
        });
        expect(race.target).toBe(512);
    });
});

describe("shared state", () => {
    it("has the version, phase, seats and every board", () => {
        const race = Race2048.create({ random: first2 });
        race.takeSeat("alice", "ALICE");
        expect(race.shared()).toMatchObject({
            version: STATE_VERSION,
            game: "2048",
            phase: "open",
            target: TARGET,
            timeLimit: TIME_LIMIT_MS,
            maxPlayers: MAX_PLAYERS,
            seats: [{ id: "alice", name: "ALICE" }],
            racers: [],
        });
        race.start();
        const shared = race.shared();
        expect(shared.phase).toBe("active");
        expect(shared.racers).toHaveLength(1);
        // Packed: the board as hex digits, two 2s with `first2`, and a letter a number
        expect(shared.racers[0]).toEqual({
            i: "alice",
            b: "1100000000000000",
            s: 0,
            t: 0,
            r: 0,
            v: 0,
            f: 0,
        });
        // The names aren't in it: the app looks the racers' usernames up by id
        expect(shared.names).toBeUndefined();
        expect(race.names()).toEqual({ alice: "ALICE" });
    });

    it("flags a stuck or winning board", () => {
        const { race } = started();
        race.data.players[0].dead = true;
        race.data.players[1].won = true;
        expect(race.shared().racers.map((r) => r.f)).toEqual([DEAD, WON]);
    });

    it("ends with every racer's name, as the card keeps the end state on its own", () => {
        const { race, time } = started(["alice", "bob"]);
        expect(race.endState()).toBeUndefined();
        time.tick(TIME_LIMIT_MS);
        race.endIfTimeUp();
        expect(race.endState()).toMatchObject({
            phase: "finished",
            names: { alice: "ALICE", bob: "BOB" },
        });
        // A hundred racers packed stay within the end state's 16 KB
        const big = Race2048.create({ random: first2 });
        for (let i = 0; i < MAX_PLAYERS; i++) {
            big.takeSeat(`aaaaa-bbbbb-ccccc-ddddd-eee-${String(i).padStart(2, "0")}`, `Racer ${i}`);
        }
        big.start();
        for (const p of big.data.players) {
            p.board = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 2, 4, 8, 16];
            p.score = 123456;
            p.best = 123456;
            p.restarts = 12;
            p.rev = 1234;
        }
        big.data.phase = "finished";
        big.data.finishedAt = big.data.startedAt;
        const bytes = Buffer.byteLength(JSON.stringify(big.endState()));
        expect(bytes).toBeLessThan(16 * 1024);
        expect(bytes).toBeGreaterThan(8 * 1024);
    });

    it("publishes less often as the field grows", () => {
        expect(publishEveryMs(1)).toBe(80);
        expect(publishEveryMs(10)).toBe(80);
        expect(publishEveryMs(11)).toBe(150);
        expect(publishEveryMs(30)).toBe(150);
        expect(publishEveryMs(31)).toBe(250);
        expect(publishEveryMs(60)).toBe(250);
        expect(publishEveryMs(100)).toBe(400);
        const { race } = started(["alice", "bob"]);
        expect(race.publishEveryMs()).toBe(80);
    });

    it("seq goes up with each state", () => {
        const race = Race2048.create();
        expect(race.nextSeq()).toBe(1);
        expect(race.nextSeq()).toBe(2);
        expect(race.data.seq).toBe(2);
    });

    it("rebuilds from its data", () => {
        const { race } = started();
        race.move("alice", "left");
        const copy = new Race2048(JSON.parse(JSON.stringify(race.data)));
        expect(copy.shared()).toEqual(race.shared());
    });
});

it("duration reads naturally", () => {
    expect(duration(45_000)).toBe("45s");
    expect(duration(135_000)).toBe("2m 15s");
    expect(duration(3_720_000)).toBe("1h 2m");
});
