// The maze race: up to ten racers, each with their own dot, in the same maze. The first out wins,
// or, when the time's up, whoever's closest to the way out. Moves come live, over the socket
// (`live.ts`), and every change goes straight back to every racer, so everyone sees everyone move.
// Each move is checked against the maze's walls here, as the page's own prediction of it isn't
// trusted. The maze is carved from a seed chosen at the start (`maze.ts`).
import { duration } from "../duration";
import type { LiveResult, Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
import { canMove, carve, DIRECTIONS, isDirection, isWayOut, stepsOut, type Maze } from "./maze";
import { MAZE_SETTINGS } from "./settings";
import { GAME_ID, MAX_PLAYERS, STATE_VERSION, type Ending, type SharedState } from "./types";

export type Racer = Seat & { x: number; y: number; ack: number; moves: number };

const refused = (error: string): LiveResult => ({ ok: false, error, changed: false });

export type MazeData = RaceData<Racer, Ending> & { seed?: number };

/**
 * How often the race's state goes through the service, which spectators see it by, at most every
 * 250 ms anyway. Racers get each change at once over the socket.
 */
const PUBLISH_MS = 250;

export class MazeRace extends Race<Racer, Ending, MazeData, SharedState> {
    readonly kind = GAME_ID;
    #maze?: Maze;

    constructor(data: MazeData, options: RaceOptions = {}) {
        super({ settings: MAZE_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): MazeRace {
        return new MazeRace(openRace(options), options);
    }

    get size(): number {
        return this.settings().size;
    }

    /** The maze, once the race has started */
    get maze(): Maze | undefined {
        if (this.#maze === undefined && this.data.seed !== undefined) {
            this.#maze = carve(this.size, this.data.seed);
        }
        return this.#maze;
    }

    /** Starts everyone seated in the top-left cell of a maze carved from a new seed */
    protected begin(seats: readonly Seat[]): Racer[] {
        this.data.seed = Math.floor(this.random() * 2 ** 31);
        return seats.map((s) => ({ ...s, x: 0, y: 0, ack: 0, moves: 0 }));
    }

    /** Whoever's closest to the way out, then made the fewest moves, then joined first */
    protected leader(): string | undefined {
        const maze = this.maze!;
        const ranked = [...this.data.players].sort(
            (a, b) => stepsOut(maze, a.x, a.y) - stepsOut(maze, b.x, b.y) || a.moves - b.moves,
        );
        return ranked[0]?.id;
    }

    override publishEveryMs(): number {
        return PUBLISH_MS;
    }

    /**
     * A racer's move, `{ move: "left", n: 7 }`, where `n` counts their moves from 1. A move the
     * bot's had already, eg. sent again after a reconnect, changes nothing; one into a wall is
     * refused, but still counted as taken, so the racer's page drops it.
     */
    receive(userId: string, message: unknown): LiveResult {
        const d = this.data;
        if (d.phase === "open") return refused("The race hasn't started");
        if (d.phase === "finished") return refused("The race is over");
        const racer = this.racer(userId);
        if (racer === undefined) return refused("You aren't in this race");
        const { move, n } = (message ?? {}) as Partial<{ move: unknown; n: unknown }>;
        if (!isDirection(move) || typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) {
            return refused("A move is a direction and its number");
        }
        if (n <= racer.ack) return { ok: true, changed: false };
        racer.ack = n;
        const maze = this.maze!;
        if (!canMove(maze, racer.x, racer.y, move)) {
            this.changed();
            return { ok: false, error: "There's a wall that way", changed: true };
        }
        racer.x += DIRECTIONS[move].dx;
        racer.y += DIRECTIONS[move].dy;
        racer.moves++;
        if (isWayOut(maze, racer.x, racer.y)) {
            this.finish("out", racer.id, this.now());
        } else {
            this.changed();
        }
        return { ok: true, changed: true };
    }

    shared(): SharedState {
        const d = this.data;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            names: this.names(),
            size: this.size,
            seed: d.seed,
            racers: d.players.map(({ id, x, y, ack, moves }) => ({ id, x, y, ack, moves })),
            rev: d.rev,
        };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) got out in 1m 12s", or "Time's
     * up! @UserId(abc) got closest to the way out", the winner a mention so the card shows their
     * username as it is now
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        if (d.winner === undefined) return "The race ended with nobody in it";
        const who = `@UserId(${d.winner})`;
        if (d.ended === "out" && d.startedAt !== undefined && d.finishedAt !== undefined) {
            return `${who} got out in ${duration(d.finishedAt - d.startedAt)}`;
        }
        return `Time's up! ${who} got closest to the way out`;
    }
}
