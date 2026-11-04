// The Crate Race: up to twenty racers push the same four crates onto the same four goals, each on
// their own copy of one of Boxoban's levels (`levels.ts`), easy, medium or hard as the host sets
// it. The first to put every crate on a goal wins, or, when the time's up, whoever has the most on
// goals, then whoever got there first. A racer's moves are their path, which their page plays as
// they make it and sends to the bot whole: undoing one, or starting again, is a shorter path. The
// bot plays it too, so it knows where their crates are, which only they see while the race is on.
import type { Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
import { isPath, play, readLevel, type Level } from "./board";
import { EASY_LEVELS, HARD_LEVELS, MEDIUM_LEVELS } from "./levels";
import { describeResult } from "./result";
import { CRATES_SETTINGS, EASY, HARD } from "./settings";
import {
    GAME_ID,
    MAX_PATH,
    MAX_PLAYERS,
    STATE_VERSION,
    type Ending,
    type OwnPath,
    type PathResponse,
    type SharedState,
} from "./types";

export type Racer = Seat & {
    path: string;
    placed: number;
    pushes: number;
    /** When their crates on goals last changed, which breaks a tie: whoever's had as many longest */
    placedAt?: number;
};

export type CratesData = RaceData<Racer, Ending> & {
    /** The level, once the race has started, and the fewest pushes it takes */
    level?: string;
    par?: number;
};

/** What a racer's request did: the answer, and whether the race changed, so it's published */
export type PathOutcome = { result: PathResponse; changed: boolean };

/** The levels a race's may be, by its difficulty, each its code then the fewest pushes it takes */
function levelsOf(difficulty: number): readonly string[] {
    return difficulty === EASY ? EASY_LEVELS : difficulty === HARD ? HARD_LEVELS : MEDIUM_LEVELS;
}

export class CrateRace extends Race<Racer, Ending, CratesData, SharedState> {
    readonly kind = GAME_ID;
    /** The level, read from its code, and the code it was read from */
    #level?: { code: string; level: Level | undefined };

    constructor(data: CratesData, options: RaceOptions = {}) {
        super({ settings: CRATES_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): CrateRace {
        return new CrateRace(openRace(options), options);
    }

    /** The race's level, once it's started */
    get level(): Level | undefined {
        const code = this.data.level;
        if (code === undefined) return undefined;
        if (this.#level?.code !== code) this.#level = { code, level: readLevel(code) };
        return this.#level.level;
    }

    /** Picks a level of the difficulty set, and starts everyone seated on it */
    protected begin(seats: readonly Seat[]): Racer[] {
        const levels = levelsOf(this.settings().difficulty);
        const [code, par] = levels[Math.floor(this.random() * levels.length)].split(" ");
        this.data.level = code;
        this.data.par = Number(par);
        const placed = play(this.level!, "").board.placed;
        return seats.map((s) => ({ ...s, path: "", placed, pushes: 0 }));
    }

    /**
     * Whoever has the most crates on goals, then whoever's had that many longest, then whoever
     * pushed the fewest times. Nobody, if nobody has one.
     */
    protected leader(): string | undefined {
        const d = this.data;
        const at = (r: Racer) => r.placedAt ?? d.startedAt ?? 0;
        const [best] = [...d.players].sort(
            (a, b) => b.placed - a.placed || at(a) - at(b) || a.pushes - b.pushes,
        );
        return best !== undefined && best.placed > 0 ? best.id : undefined;
    }

    /** A racer's own moves, which only they see while the race is on */
    own(userId: string): OwnPath | undefined {
        const racer = this.racer(userId);
        return racer === undefined ? undefined : { path: racer.path };
    }

    /**
     * A racer's moves, `{ "path": "rrdlu" }`, every move they've made from the level's start less
     * the ones they've undone, answered with their path as the bot has it. No path at all just asks
     * for it, eg. as the page opens. A path with a move that can't be made is refused, whole.
     * Walking about changes nothing anyone else sees, so only a push is published.
     */
    path(userId: string, body: unknown): PathOutcome {
        const d = this.data;
        const fail = (error: string): PathOutcome => ({
            result: { ok: false, error, own: this.own(userId) },
            changed: false,
        });
        if (d.phase === "open") return fail("The race hasn't started");
        const racer = this.racer(userId);
        if (racer === undefined) return fail("You aren't in this race");
        const path = (body as { path?: unknown } | undefined)?.path;
        if (path === undefined) {
            return { result: { ok: true, own: this.own(userId)! }, changed: false };
        }
        if (d.phase === "finished") return fail("The race is over");
        if (!isPath(path, MAX_PATH)) {
            return fail(`A path is up to ${MAX_PATH} moves, each one of u, d, l and r`);
        }
        const level = this.level;
        if (level === undefined) return fail("This race's level can't be read");
        const { board, played } = play(level, path);
        if (played < path.length) return fail("One of those moves can't be made");
        const changed = board.pushes !== racer.pushes || board.placed !== racer.placed;
        if (board.placed !== racer.placed) racer.placedAt = this.now();
        racer.path = path;
        racer.placed = board.placed;
        racer.pushes = board.pushes;
        if (board.solved) {
            this.finish("solved", racer.id, this.now());
        } else if (changed) {
            this.changed();
        }
        return { result: { ok: true, own: this.own(userId)! }, changed: changed || board.solved };
    }

    /** Each racer's own moves while the race is on, which the service gives only to them */
    privateState(): Record<string, OwnPath> | undefined {
        if (this.data.phase !== "active") return undefined;
        return Object.fromEntries(this.data.players.map((p) => [p.id, this.own(p.id)!]));
    }

    /**
     * What everyone sees: how far each racer's got, and, once it's over, where their crates ended
     * up, and the winner's moves
     */
    shared(): SharedState {
        const d = this.data;
        const finished = d.phase === "finished";
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            level: d.level,
            par: d.par,
            racers: d.players.map((p) => {
                const racer = { id: p.id, placed: p.placed, pushes: p.pushes };
                const level = this.level;
                if (!finished || level === undefined) return racer;
                const { board } = play(level, p.path);
                return { ...racer, crates: [...board.crates], player: board.player };
            }),
            path: finished ? d.players.find((p) => p.id === d.winner)?.path : undefined,
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) put every crate on a goal in 48s,
     * with 23 pushes", the winner a mention so the card shows their username as it is now
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        const winner = d.players.find((p) => p.id === d.winner);
        const crates = this.level?.crates.length ?? 0;
        return describeResult(d, winner && { ...winner, crates }, (id) => `@UserId(${id})`);
    }
}
