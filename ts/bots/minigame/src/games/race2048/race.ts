// The 2048 race: up to 100 players, each on their own board, and the first to make a 2048 tile wins.
// If nobody has in 10 minutes, the top score wins: a player's best from any of their boards, as a
// player whose board gets stuck can restart on a fresh board, as often as they like, and the
// restarts are counted for everyone to see.
//
// The bot decides every move, so no one can forge a board. The race keeps its whole state in
// `Race2048Data`, which the store writes to disk as it is.
import { duration } from "../duration";
import type { Seat } from "../game";
import { openRace, Race, type RaceData, type RaceOptions } from "../race";
import {
    canMove,
    isDirection,
    maxTile,
    newBoard,
    packBoard,
    slide,
    spawn,
    type Board,
    type Direction,
} from "./engine";
import {
    DEAD,
    GAME_ID,
    MAX_PLAYERS,
    STATE_VERSION,
    WON,
    type Ending,
    type MoveResponse,
    type Racer,
    type PlayerView,
    type SharedState,
} from "./types";
import { RACE_SETTINGS } from "./settings";

export type PlayerData = Seat & {
    board: Board;
    /** The current board's score */
    score: number;
    /** The top score of any of their boards */
    best: number;
    moves: number;
    restarts: number;
    rev: number;
    dead: boolean;
    won: boolean;
};

export type Race2048Data = RaceData<PlayerData, Ending> & {
    lastMove?: { player: string; direction: Direction };
};

/** How long the publisher waits between a race's states, by how many are racing: a bigger field
 * is a bigger state, sent to more people, so less often. A player's own board doesn't wait on it. */
export function publishEveryMs(players: number): number {
    if (players <= 10) return 80;
    if (players <= 30) return 150;
    if (players <= 60) return 250;
    return 400;
}

export class Race2048 extends Race<PlayerData, Ending, Race2048Data, SharedState> {
    readonly kind = GAME_ID;

    constructor(data: Race2048Data, options: RaceOptions = {}) {
        super({ settings: RACE_SETTINGS, maxPlayers: MAX_PLAYERS }, data, options);
    }

    static create(options: RaceOptions = {}): Race2048 {
        return new Race2048(openRace(options), options);
    }

    /** The tile which wins */
    get target(): number {
        return this.settings().target;
    }

    /** How long the race lasts if nobody makes the target tile */
    get timeLimit(): number {
        return this.lengthMs();
    }

    get winner(): PlayerData | undefined {
        return this.racer(this.data.winner);
    }

    /** Starts everyone seated on a fresh board */
    protected begin(seats: readonly Seat[]): PlayerData[] {
        return seats.map((seat) => ({
            id: seat.id,
            name: seat.name,
            board: newBoard(this.random),
            score: 0,
            best: 0,
            moves: 0,
            restarts: 0,
            rev: 0,
            dead: false,
            won: false,
        }));
    }

    /**
     * The top score, which wins when the time's up: a player's best from any of their boards;
     * ties go to the higher current score, then the higher tile, then the fewer restarts
     */
    protected leader(): string | undefined {
        return [...this.data.players].sort(rank)[0]?.id;
    }

    protected override finish(ended: Ending, winner: string | undefined, at: number): void {
        const p = this.racer(winner);
        if (p !== undefined) p.won = true;
        super.finish(ended, winner, at);
    }

    /** A race ends at its time whether or not the bot was up for all of it */
    override resume(): boolean {
        return false;
    }

    override publishEveryMs(): number {
        return publishEveryMs(this.data.players.length);
    }

    move(userId: string, direction: unknown): MoveResponse {
        if (!isDirection(direction)) return { ok: false, error: "Not a direction" };
        this.endIfTimeUp();
        const player = this.#racingPlayer(userId);
        if (!player.ok) return player;
        if (player.player.dead) {
            return { ok: false, error: "Your board is stuck. Restart to keep racing." };
        }
        const { board, gained, moved } = slide(player.player.board, direction);
        if (!moved) {
            return {
                ok: true,
                player: view(player.player),
                gained: 0,
                moved: false,
                phase: this.data.phase,
            };
        }
        const p = player.player;
        // `slide` says the board changed, so there's an empty cell for the new tile
        p.board = spawn(board, this.random);
        p.score += gained;
        p.best = Math.max(p.best, p.score);
        p.moves++;
        p.rev++;
        this.data.lastMove = { player: userId, direction };
        if (maxTile(p.board) >= this.target) {
            this.finish("target", userId, this.now());
        } else {
            p.dead = !canMove(p.board);
            this.changed();
        }
        return { ok: true, player: view(p), gained, moved: true, phase: this.data.phase };
    }

    /** A fresh board for a player, counted against them */
    restart(userId: string): MoveResponse {
        this.endIfTimeUp();
        const player = this.#racingPlayer(userId);
        if (!player.ok) return player;
        const p = player.player;
        p.board = newBoard(this.random);
        p.score = 0;
        p.moves = 0;
        p.restarts++;
        p.rev++;
        p.dead = false;
        this.changed();
        return { ok: true, player: view(p), gained: 0, moved: true, phase: this.data.phase };
    }

    #racingPlayer(userId: string): { ok: true; player: PlayerData } | { ok: false; error: string } {
        if (this.data.phase === "open") return { ok: false, error: "The race hasn't started" };
        if (this.data.phase === "finished") return { ok: false, error: "The race is over" };
        const player = this.racer(userId);
        if (player === undefined) return { ok: false, error: "You aren't in this race" };
        return { ok: true, player };
    }

    /** The state everyone sees */
    shared(): SharedState {
        const d = this.data;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            ...this.base(),
            target: this.target,
            timeLimit: this.timeLimit,
            maxPlayers: MAX_PLAYERS,
            racers: d.players.map(pack),
            lastMove: d.lastMove === undefined ? undefined : { ...d.lastMove },
        };
    }

    /**
     * How the race ended is its final shared state with the racers' names, as the card keeps it
     * on its own: every board, the winner and the times, which the app shows the finished race
     * from. A hundred racers packed is about 11 KB, within the end state's 16 KB.
     */
    override endState(): SharedState | undefined {
        if (this.data.phase !== "finished") return undefined;
        return { ...this.shared(), names: this.names() };
    }

    /**
     * The card's result once the race is over, eg. "@UserId(abc) reached 2048 in 2m 15s", or
     * "Time's up! @UserId(abc) won with 5,432 points". The winner is a mention rather than a name,
     * so the card shows their username as it is now, whenever it's read.
     */
    result(): string | undefined {
        const d = this.data;
        if (d.phase !== "finished") return undefined;
        const winner = this.winner;
        if (winner === undefined || d.startedAt === undefined || d.finishedAt === undefined) {
            return "The race ended with no winner";
        }
        const who = `@UserId(${winner.id})`;
        if (d.ended === "time") {
            const points = winner.best.toLocaleString("en-US");
            return `Time's up! ${who} won with ${points} points`;
        }
        return `${who} reached ${this.target} in ${duration(d.finishedAt - d.startedAt)}`;
    }
}

function view(p: PlayerData): PlayerView {
    return {
        id: p.id,
        name: p.name,
        board: p.board.slice(),
        score: p.score,
        best: p.best,
        restarts: p.restarts,
        rev: p.rev,
        dead: p.dead,
        won: p.won,
    };
}

/** A racer as the state carries one */
function pack(p: PlayerData): Racer {
    return {
        i: p.id,
        b: packBoard(p.board),
        s: p.score,
        t: p.best,
        r: p.restarts,
        v: p.rev,
        f: (p.dead ? DEAD : 0) | (p.won ? WON : 0),
    };
}

/** The order players rank in: the best score first, then the current score, the tile and the fewer restarts */
export function rank(a: PlayerData, b: PlayerData): number {
    return (
        b.best - a.best ||
        b.score - a.score ||
        maxTile(b.board) - maxTile(a.board) ||
        a.restarts - b.restarts
    );
}
