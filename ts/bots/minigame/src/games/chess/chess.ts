// A game of chess between two members of a chat, or between the host and the computer, which
// everyone else can watch. Two join, or the host alone when the settings pick the computer; when
// the host starts the game, White is whoever the settings say, or is chosen at random, and it's
// White's move, with each side's time and the increment from the settings, though a side's clock
// doesn't run for its first move. The rules and the clocks are the `Match`'s; this knows who plays
// each side, and what the card and the app are told. The computer's moves come from the bot's
// engine (`computer/`), which asks `computerTurn` and answers with `playComputer`.
import {
    jsonBytes,
    MAX_END_STATE_BYTES,
    PUBLISH_EVERY_MS,
    type ComputerTurn,
    type ConfigureResult,
    type Game,
    type Host,
    type Phase,
} from "../game";
import { defaultSettings, type Settings } from "../settings";
import { describe, Match, type MatchData } from "./match";
import {
    CHESS_SETTINGS,
    computerLevel,
    computerName,
    WHITE_IS_HOST,
    WHITE_IS_OPPONENT,
} from "./settings";
import {
    COMPUTER,
    GAME_ID,
    STATE_VERSION,
    type ActionResponse,
    type EndState,
    type SharedState,
    type Side,
} from "./types";

export type ChessData = {
    /** Who's joined, in order, with their names. Once the game starts: White, then Black. */
    players: { id: string; name: string }[];
    /** The `seq` of the last state published, which each state goes above */
    seq: number;
    createdAt: number;
    startedAt?: number;
    finishedAt?: number;
    /** The board and the clocks, once the game has started */
    match?: MatchData;
    /** The settings chosen, by id (`CHESS_SETTINGS`); the rest are the defaults */
    settings?: Settings;
    /**
     * Who ran `/play`: the one who can change the settings and start the game, and "the host" in
     * `white`
     */
    host?: string;
    hostName?: string;
};

export type ChessOptions = {
    random?: () => number;
    now?: () => number;
    /** The settings to start with, eg. for a test; any left out is its default */
    settings?: Settings;
    host?: Host;
};

export class ChessGame implements Game {
    readonly kind = "chess";
    readonly #data: ChessData;
    readonly #random: () => number;
    readonly #now: () => number;
    #match?: Match;

    constructor(data: ChessData, options: ChessOptions = {}) {
        this.#data = data;
        this.#random = options.random ?? Math.random;
        this.#now = options.now ?? Date.now;
        if (data.match !== undefined) {
            this.#match = new Match(data.match);
        }
    }

    static create(options: ChessOptions = {}): ChessGame {
        const now = options.now ?? Date.now;
        return new ChessGame(
            {
                players: [],
                seq: 0,
                createdAt: now(),
                settings: options.settings,
                host: options.host?.id,
                hostName: options.host?.name,
            },
            options,
        );
    }

    get data(): ChessData {
        return this.#data;
    }

    get phase(): Phase {
        if (this.#match === undefined) return "open";
        return this.#match.isOver ? "finished" : "active";
    }

    get createdAt(): number {
        return this.#data.createdAt;
    }

    get finishedAt(): number | undefined {
        return this.#data.finishedAt;
    }

    get match(): Match | undefined {
        return this.#match;
    }

    get white(): string | undefined {
        return this.#match === undefined ? undefined : this.#data.players[0]?.id;
    }

    get black(): string | undefined {
        return this.#match === undefined ? undefined : this.#data.players[1]?.id;
    }

    isSeated(userId: string): boolean {
        return this.#data.players.some((p) => p.id === userId);
    }

    isPlayer(userId: string): boolean {
        return this.#match !== undefined && this.isSeated(userId);
    }

    /** The side the user plays, once the game has started */
    sideOf(userId: string): Side | undefined {
        if (userId === this.white) return "white";
        if (userId === this.black) return "black";
        return undefined;
    }

    join(userId: string, name: string): string | undefined {
        if (this.#match !== undefined) return "The game has started";
        if (this.isSeated(userId)) return undefined;
        if (this.#againstComputer() && userId !== this.#data.host) {
            return "The host is playing the computer";
        }
        if (this.#data.players.length >= 2) return "This game is for two";
        this.#data.players.push({ id: userId, name });
        return undefined;
    }

    /**
     * Before the start, frees the user's seat. After it, a player the service couldn't keep, eg.
     * one who left the chat, so the game can't go on and the other side wins by abandonment.
     */
    leave(userId: string): boolean {
        if (this.#match === undefined) {
            const before = this.#data.players.length;
            this.#data.players = this.#data.players.filter((p) => p.id !== userId);
            return this.#data.players.length < before;
        }
        // A flag that fell before they left is the result: the leave doesn't change it
        const flagged = this.endIfTimeUp();
        const side = this.sideOf(userId);
        if (side === undefined || this.#match.isOver) return flagged;
        this.#match.abandon(side, this.#now());
        this.#finished();
        return true;
    }

    cannotStart(): string | undefined {
        if (this.#match !== undefined) return undefined;
        if (this.#againstComputer()) {
            const host = this.#data.host;
            return host !== undefined && this.isSeated(host)
                ? undefined
                : "The host plays the computer";
        }
        if (this.#data.players.length < 2) return "Chess needs two players";
        return undefined;
    }

    /**
     * Starts the game between the two who've joined, or between the host and the computer, with
     * anyone else who joined meanwhile left out. White, who moves first, is the host or their
     * opponent if the settings say so and the host is playing; otherwise it's random. The
     * players the service is told of are only the people.
     */
    start(): string[] {
        const level = computerLevel(this.settings());
        if (this.#match === undefined && level !== undefined && this.#data.host !== undefined) {
            const host = this.#data.players.find((p) => p.id === this.#data.host);
            if (host !== undefined) {
                this.#data.players = [host, { id: COMPUTER, name: computerName(level) }];
            }
        }
        if (this.#match === undefined && this.#data.players.length === 2) {
            const settings = this.settings();
            const host = this.#data.host;
            const hostFirst = host !== undefined && this.#data.players[0].id === host;
            const hostPlays = host !== undefined && this.isSeated(host);
            const reverse =
                hostPlays && settings.white === WHITE_IS_HOST
                    ? !hostFirst
                    : hostPlays && settings.white === WHITE_IS_OPPONENT
                      ? hostFirst
                      : this.#random() < 0.5;
            if (reverse) {
                this.#data.players.reverse();
            }
            const now = this.#now();
            this.#match = Match.create(now, undefined, {
                perSideMs: settings.minutes * 60_000,
                incrementMs: settings.increment * 1000,
            });
            this.#data.match = this.#match.data;
            this.#data.startedAt = now;
        }
        return this.#data.players.map((p) => p.id).filter((id) => id !== COMPUTER);
    }

    /** The player whose move it is, while the game's on, but for the computer */
    waitingFor(): string[] {
        if (this.#match === undefined || this.#match.isOver) return [];
        const id = this.#match.turn === "white" ? this.white : this.black;
        return id === undefined || id === COMPUTER ? [] : [id];
    }

    /** The computer's level, if it plays in this game, or will once it starts */
    get computerLevel(): number | undefined {
        if (this.#match === undefined) return computerLevel(this.settings());
        return this.isSeated(COMPUTER) ? computerLevel(this.settings()) : undefined;
    }

    #againstComputer(): boolean {
        return this.#match === undefined
            ? computerLevel(this.settings()) !== undefined
            : this.isSeated(COMPUTER);
    }

    /**
     * When it's the computer's move: the position, as FEN, its level, how many moves have been
     * made, which `playComputer` is given back, so a move found for an earlier position isn't
     * played, and how long the computer has left to make it, on its clock or for its first move
     */
    computerTurn(): ComputerTurn | undefined {
        const match = this.#match;
        const level = this.computerLevel;
        if (match === undefined || match.isOver || level === undefined) return undefined;
        const id = match.turn === "white" ? this.white : this.black;
        if (id !== COMPUTER) return undefined;
        const now = this.#now();
        return {
            fen: match.fens[match.fens.length - 1],
            level,
            ply: match.moves.length,
            timeLeftMs: match.firstMoveLeft(now) ?? match.timeLeft(match.turn, now),
        };
    }

    /**
     * Plays the computer's move, given as UCI, if it's still its move in the position it was
     * found for, `ply` moves in. Whether the game changed: the move was played, or the
     * computer's time ran out first, which ends the game.
     */
    playComputer(ply: number, uci: string): boolean {
        const match = this.#match;
        if (this.computerTurn()?.ply !== ply || match === undefined) return false;
        // A flag that's fallen first is the result
        if (this.endIfTimeUp()) return true;
        const error = match.play(match.turn, uci, this.#now());
        if (error !== undefined) {
            console.error(`The computer's move ${uci} wasn't played: ${error}`);
            return false;
        }
        if (match.isOver) this.#finished();
        return true;
    }

    /** Every setting as it stands: the ones chosen over the defaults */
    settings(): Settings {
        return { ...defaultSettings(CHESS_SETTINGS), ...this.#data.settings };
    }

    get host(): string | undefined {
        return this.#data.host;
    }

    /** Changes settings, which only the host can, and only before the game starts */
    configure(userId: string, settings: Settings): ConfigureResult {
        if (this.#match !== undefined) return { ok: false, error: "The game has started" };
        if (userId !== this.#data.host) {
            return { ok: false, error: "Only the host can change the settings" };
        }
        this.#data.settings = { ...this.#data.settings, ...settings };
        return { ok: true };
    }

    /** When the game ends unless the side to move moves first, as the `Match` says */
    deadline(): number | undefined {
        return this.#match?.deadline();
    }

    endIfTimeUp(): boolean {
        if (this.#match === undefined || !this.#match.flag(this.#now())) return false;
        this.#finished();
        return true;
    }

    /** The side to move isn't charged for the time the bot was down */
    resume(downMs: number): boolean {
        return this.#match?.pause(downMs) ?? false;
    }

    publishEveryMs(): number {
        return PUBLISH_EVERY_MS;
    }

    nextSeq(): number {
        return ++this.#data.seq;
    }

    /** Plays the user's move, given as UCI, eg. "e2e4", answering the new state or why not */
    move(userId: string, uci: unknown): ActionResponse {
        return this.#act(userId, (match, side) =>
            typeof uci === "string" ? match.play(side, uci, this.#now()) : "Send the move as UCI",
        );
    }

    resign(userId: string): ActionResponse {
        return this.#act(userId, (match, side) => match.resign(side, this.#now()));
    }

    /**
     * Offers the other player a draw, or accepts theirs if it stands, which ends the game. The
     * computer plays on.
     */
    offerDraw(userId: string): ActionResponse {
        return this.#act(userId, (match, side) =>
            this.isSeated(COMPUTER)
                ? "The computer plays on: resign to end the game"
                : match.offerDraw(side, this.#now()),
        );
    }

    // Something the user does to the board as the side they play
    #act(userId: string, action: (match: Match, side: Side) => string | undefined): ActionResponse {
        if (this.#match === undefined) {
            return {
                ok: false,
                error: this.isSeated(userId) ? "Start the game first" : "You're not playing",
            };
        }
        // Any flag that's fallen comes first, whatever the request
        this.endIfTimeUp();
        const side = this.sideOf(userId);
        if (side === undefined) return { ok: false, error: "You're not playing" };
        const error = action(this.#match, side);
        if (error !== undefined) return { ok: false, error };
        if (this.#match.isOver) this.#finished();
        return { ok: true, shared: this.shared() };
    }

    #finished(): void {
        this.#data.finishedAt ??= this.#now();
    }

    shared(): SharedState {
        const names: Record<string, string> = {};
        // The host's name, so the lobby can say who's White before they've joined
        if (this.#data.host !== undefined && this.#data.hostName !== undefined) {
            names[this.#data.host] = this.#data.hostName;
        }
        for (const p of this.#data.players) names[p.id] = p.name;
        const status =
            this.phase === "open" ? "Open" : this.phase === "active" ? "Active" : "Finished";
        return {
            version: STATE_VERSION,
            game: GAME_ID,
            status,
            players: this.#data.players.map((p) => p.id),
            names,
            white: this.white ?? null,
            black: this.black ?? null,
            settings: this.settings(),
            host: this.#data.host ?? null,
            ...this.#match?.snapshot(this.#now()),
        };
    }

    result(): string | undefined {
        const ending = this.#match?.ending;
        return ending === undefined ? undefined : describe(ending);
    }

    /**
     * The game as it ended, for the card to keep: the positions are the placement field of each
     * FEN, which is all the app shows. A very long game keeps only its final position, marked
     * `truncated`; one too long even for that is over the publisher's limit, which sends nothing,
     * so the card shows the image and the result.
     */
    endState(): EndState | undefined {
        const match = this.#match;
        const white = this.white;
        const black = this.black;
        const ending = match?.ending;
        if (
            match === undefined ||
            ending === undefined ||
            white === undefined ||
            black === undefined
        ) {
            return undefined;
        }
        const names: Record<string, string> = {};
        for (const p of this.#data.players) names[p.id] = p.name;
        const state: EndState = {
            version: STATE_VERSION,
            game: GAME_ID,
            result: describe(ending),
            winner:
                ending.kind === "aborted" ? undefined : "winner" in ending ? ending.winner : null,
            started_at: this.#data.startedAt ?? this.#data.createdAt,
            white,
            black,
            names,
            moves: [...match.moves],
            fens: match.fens.map(placement),
            last_move: match.lastMove === undefined ? null : { ...match.lastMove },
            captured: match.captured,
        };
        return fitEndState(state);
    }

    toJson(): ChessData {
        return this.#data;
    }
}

/** The end state within the service's limit if it fits, or with only its final position if not */
export function fitEndState(state: EndState): EndState {
    if (jsonBytes(state) <= MAX_END_STATE_BYTES) return state;
    return { ...state, fens: state.fens.slice(-1), truncated: true };
}

/** The pieces on the board: the first field of a FEN */
function placement(fen: string): string {
    return fen.split(" ")[0];
}
