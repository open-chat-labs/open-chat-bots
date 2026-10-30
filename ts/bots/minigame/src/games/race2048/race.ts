// The 2048 race: up to 10 players, each on their own board, and the first to make a 2048 tile wins.
// If nobody has in 10 minutes, the top score wins: a player's best from any of their boards, as a
// player whose board gets stuck can restart on a fresh board, as often as they like, and the
// restarts are counted for everyone to see.
//
// The bot decides every move, so no one can forge a board. The race keeps its whole state in
// `RaceData`, which the store writes to disk as it is.
import { defaultSettings, type Settings } from "../settings";
import {
    canMove,
    isDirection,
    maxTile,
    newBoard,
    slide,
    spawn,
    type Board,
    type Direction,
} from "./engine";
import {
    GAME_ID,
    MAX_PLAYERS,
    STATE_VERSION,
    TARGET,
    TIME_LIMIT_MS,
    type Ending,
    type MoveResponse,
    type Phase,
    type PlayerView,
    type Seat,
    type SharedState,
} from "./types";
import { RACE_SETTINGS } from "./settings";

export type PlayerData = {
    id: string;
    name: string;
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

export type RaceData = {
    phase: Phase;
    /** The settings chosen, by id (`RACE_SETTINGS`); the rest are the defaults */
    settings?: Settings;
    /** Who ran `/play`: the one who can change the settings */
    host?: string;
    seats: Seat[];
    players: PlayerData[];
    /** The `seq` of the last state published, which each state goes above */
    seq: number;
    createdAt: number;
    startedAt?: number;
    /** When the race ends if nobody makes the target tile: the start plus the time limit */
    endsAt?: number;
    finishedAt?: number;
    ended?: Ending;
    winner?: string;
    lastMove?: { player: string; direction: Direction };
};

export type RaceOptions = {
    random?: () => number;
    now?: () => number;
    /** The settings to start with, eg. from the command; any left out is its default */
    settings?: Settings;
    host?: string;
};

export type ConfigureResult = { ok: true } | { ok: false; error: string };

export type SeatResult = "seated" | "already_seated" | "full" | "started";

export class Race2048 {
    readonly #data: RaceData;
    readonly #random: () => number;
    readonly #now: () => number;

    constructor(data: RaceData, options: RaceOptions = {}) {
        this.#data = data;
        // A race saved before players had a best: the current score is the best known
        for (const p of data.players) {
            p.best ??= p.score;
        }
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
    }

    static create(options: RaceOptions = {}): Race2048 {
        const now = options.now ?? Date.now;
        return new Race2048(
            {
                phase: "open",
                seats: [],
                players: [],
                seq: 0,
                createdAt: now(),
                settings: options.settings,
                host: options.host,
            },
            options,
        );
    }

    /** The race's state as it is, for the store to write. It changes as the race does. */
    get data(): RaceData {
        return this.#data;
    }

    get phase(): Phase {
        return this.#data.phase;
    }

    get seats(): readonly Seat[] {
        return this.#data.seats;
    }

    get players(): readonly PlayerData[] {
        return this.#data.players;
    }

    /** Every setting as it stands: the ones chosen over the defaults */
    get settings(): Settings {
        return { ...defaultSettings(RACE_SETTINGS), ...this.#data.settings };
    }

    get host(): string | undefined {
        return this.#data.host;
    }

    get target(): number {
        return this.#data.settings?.target ?? TARGET;
    }

    get timeLimit(): number {
        const minutes = this.#data.settings?.minutes;
        return minutes === undefined ? TIME_LIMIT_MS : minutes * 60_000;
    }

    /** Changes settings, which only the host can, and only before the race starts */
    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#data.phase !== "open") return { ok: false, error: "The race has started" };
        if (userId !== this.#data.host) {
            return { ok: false, error: "Only the host can change the settings" };
        }
        this.#data.settings = { ...this.#data.settings, ...settings };
        return { ok: true };
    }

    get winner(): PlayerData | undefined {
        return this.#data.players.find((p) => p.id === this.#data.winner);
    }

    /** Whether the user is racing, which is only so once the game has started */
    isPlayer(userId: string): boolean {
        return this.#data.players.some((p) => p.id === userId);
    }

    isSeated(userId: string): boolean {
        return this.#data.seats.some((s) => s.id === userId);
    }

    /** Gives a user a seat, before the game starts. They play once it starts. */
    takeSeat(userId: string, name: string): SeatResult {
        if (this.#data.phase !== "open") return "started";
        if (this.isSeated(userId)) return "already_seated";
        if (this.#data.seats.length >= MAX_PLAYERS) return "full";
        this.#data.seats.push({ id: userId, name });
        return "seated";
    }

    /** Takes a user's seat away, before the game starts. Nothing happens if they had none. */
    leaveSeat(userId: string): boolean {
        const before = this.#data.seats.length;
        this.#data.seats = this.#data.seats.filter((s) => s.id !== userId);
        return this.#data.seats.length < before;
    }

    /** Why the game can't start yet, or undefined when it can */
    cannotStart(): string | undefined {
        if (this.#data.phase !== "open") return undefined;
        if (this.#data.seats.length === 0) return "Nobody has joined yet";
        return undefined;
    }

    /**
     * Starts the race with everyone seated, each on a fresh board. Starting a race that has
     * started does nothing more. Returns the players' ids.
     */
    start(): string[] {
        if (this.#data.phase === "open") {
            this.#data.players = this.#data.seats.map((seat) => ({
                id: seat.id,
                name: seat.name,
                board: newBoard(this.#random),
                score: 0,
                best: 0,
                moves: 0,
                restarts: 0,
                rev: 0,
                dead: false,
                won: false,
            }));
            this.#data.seats = [];
            this.#data.phase = "active";
            this.#data.startedAt = this.#now();
            this.#data.endsAt = this.#data.startedAt + this.timeLimit;
        }
        return this.#data.players.map((p) => p.id);
    }

    /**
     * Ends the race with the top score as the winner if its time is up, and says whether it did
     * just now. Called before a move, and every second by the bot, so a race ends on time whether
     * or not anyone's still playing. The top score is a player's best from any of their boards;
     * ties go to the higher current score, then the higher tile, then the fewer restarts.
     */
    endIfTimeUp(): boolean {
        const d = this.#data;
        if (d.phase !== "active" || d.endsAt === undefined || this.#now() < d.endsAt) return false;
        const top = [...d.players].sort(rank)[0];
        if (top !== undefined) {
            top.won = true;
            d.winner = top.id;
        }
        d.ended = "time";
        d.phase = "finished";
        d.finishedAt = this.#now();
        return true;
    }

    /** The next state's `seq`, above every state published before */
    nextSeq(): number {
        return ++this.#data.seq;
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
            return { ok: true, player: view(player.player), gained: 0, moved: false, phase: this.#data.phase };
        }
        const p = player.player;
        // `slide` says the board changed, so there's an empty cell for the new tile
        p.board = spawn(board, this.#random);
        p.score += gained;
        p.best = Math.max(p.best, p.score);
        p.moves++;
        p.rev++;
        this.#data.lastMove = { player: userId, direction };
        if (maxTile(p.board) >= this.target) {
            p.won = true;
            this.#data.winner = userId;
            this.#data.ended = "target";
            this.#data.phase = "finished";
            this.#data.finishedAt = this.#now();
        } else if (!canMove(p.board)) {
            p.dead = true;
        }
        return { ok: true, player: view(p), gained, moved: true, phase: this.#data.phase };
    }

    /** A fresh board for a player, counted against them */
    restart(userId: string): MoveResponse {
        this.endIfTimeUp();
        const player = this.#racingPlayer(userId);
        if (!player.ok) return player;
        const p = player.player;
        p.board = newBoard(this.#random);
        p.score = 0;
        p.moves = 0;
        p.restarts++;
        p.rev++;
        p.dead = false;
        return { ok: true, player: view(p), gained: 0, moved: true, phase: this.#data.phase };
    }

    #racingPlayer(userId: string): { ok: true; player: PlayerData } | { ok: false; error: string } {
        if (this.#data.phase === "open") return { ok: false, error: "The race hasn't started" };
        if (this.#data.phase === "finished") return { ok: false, error: "The race is over" };
        const player = this.#data.players.find((p) => p.id === userId);
        if (player === undefined) return { ok: false, error: "You aren't in this race" };
        return { ok: true, player };
    }

    /** The state everyone sees */
    shared(): SharedState {
        const d = this.#data;
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            phase: d.phase,
            settings: this.settings,
            host: d.host,
            target: this.target,
            timeLimit: this.timeLimit,
            maxPlayers: MAX_PLAYERS,
            seats: d.seats.map((s) => ({ ...s })),
            players: d.players.map(view),
            startedAt: d.startedAt,
            endsAt: d.endsAt,
            finishedAt: d.finishedAt,
            ended: d.ended,
            winner: d.winner,
            lastMove: d.lastMove === undefined ? undefined : { ...d.lastMove },
        };
    }

    /**
     * The card's result once the race is over, eg. "Alice reached 2048 in 2m 15s", or
     * "Time's up after 10m: Alice won with 5,432 points"
     */
    result(): string | undefined {
        const d = this.#data;
        if (d.phase !== "finished") return undefined;
        const winner = this.winner;
        if (winner === undefined || d.startedAt === undefined || d.finishedAt === undefined) {
            return "The race ended with no winner";
        }
        const name = winner.name.length > 100 ? `${winner.name.slice(0, 99)}…` : winner.name;
        if (d.ended === "time") {
            const points = winner.best.toLocaleString("en-US");
            return `Time's up after ${duration(this.timeLimit)}: ${name} won with ${points} points`;
        }
        return `${name} reached ${this.target} in ${duration(d.finishedAt - d.startedAt)}`;
    }
}

function view(p: PlayerData): PlayerView {
    return {
        id: p.id,
        name: p.name,
        board: p.board.slice(),
        score: p.score,
        best: p.best,
        moves: p.moves,
        restarts: p.restarts,
        rev: p.rev,
        dead: p.dead,
        won: p.won,
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

/** eg. "45s", "2m 15s", "1h 2m" */
export function duration(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${rest}s`;
    return `${rest}s`;
}
