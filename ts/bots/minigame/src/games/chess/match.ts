// One game of chess, with its clock. The rules are chess.js's. Each side has ten minutes for the
// whole game, with no increment, and the game ends by itself on checkmate, stalemate, insufficient
// material, threefold repetition, the fifty-move rule, or a flag falling. Who plays each side is
// the bot's business: this knows only White and Black.
import { Chess, type Color, type Square } from "chess.js";
import { TIME_PER_SIDE_MS, type LastMove, type Side, type Snapshot } from "./types";

/** How a game ended, with the winner where there is one */
export type Ending =
    | { kind: "checkmate" | "resignation" | "timeout" | "abandonment"; winner: Side }
    | {
          kind:
              | "stalemate"
              | "insufficient_material"
              | "repetition"
              | "fifty_moves"
              | "agreement"
              /** A flag fell, but the other side couldn't have mated, so no one wins */
              | "timeout_draw";
      };

/** The match's whole state, as the store writes it. The position is replayed from the moves. */
export type MatchData = {
    /** The position the game began from, if not the usual one */
    start?: string;
    /** Every move so far, in standard algebraic notation */
    moves: string[];
    /** The position before any move and after each: one more than `moves` */
    fens: string[];
    lastMove?: LastMove;
    clock: {
        /** What each side had left when its clock last stopped */
        whiteMs: number;
        blackMs: number;
        /** When the side to move's clock started running. Once the game's over, nothing runs. */
        since: number;
    };
    drawOffer?: Side;
    ending?: Ending;
};

const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export class Match {
    readonly #data: MatchData;
    readonly #position: Chess;

    /** A match from its saved state, replaying its moves so the rules know every position */
    constructor(data: MatchData) {
        this.#data = data;
        this.#position = new Chess(data.start);
        for (const san of data.moves) {
            this.#position.move(san);
        }
    }

    /** The starting position, with White's clock running from `now` */
    static create(now: number, start?: string): Match {
        const position = new Chess(start);
        return new Match({
            start,
            moves: [],
            fens: [position.fen()],
            clock: { whiteMs: TIME_PER_SIDE_MS, blackMs: TIME_PER_SIDE_MS, since: now },
        });
    }

    get data(): MatchData {
        return this.#data;
    }

    /** Whose move it is. Once the game's over, whose move it would have been. */
    get turn(): Side {
        return side(this.#position.turn());
    }

    get ending(): Ending | undefined {
        return this.#data.ending;
    }

    get isOver(): boolean {
        return this.#data.ending !== undefined;
    }

    get moves(): readonly string[] {
        return this.#data.moves;
    }

    /** The position before any move and after each, the last being the position as it stands */
    get fens(): readonly string[] {
        return this.#data.fens;
    }

    get lastMove(): LastMove | undefined {
        return this.#data.lastMove;
    }

    /** How long the side has left, as its clock runs */
    timeLeft(color: Side, now: number): number {
        const left = this.#left(color);
        if (this.isOver || color !== this.turn) return left;
        return Math.max(0, left - Math.max(0, now - this.#data.clock.since));
    }

    /** When the side to move's flag falls, unless it moves first */
    deadline(): number | undefined {
        if (this.isOver) return undefined;
        return this.#data.clock.since + this.#left(this.turn);
    }

    /**
     * Plays the side's move, given as UCI: the squares it's from and to, eg. "e2e4", "e1g1" to
     * castle, with the piece to promote to on the end, eg. "e7e8q". The side's clock stops and the
     * other's starts, an offer of a draw by the other side lapses, and the game ends if the move
     * ends it. Returns why it wasn't played, or undefined.
     */
    play(color: Side, uci: string, now: number): string | undefined {
        if (this.isOver) return "The game has finished";
        if (color !== this.turn) return "It's not your turn";
        if (this.timeLeft(color, now) === 0) return "Your time ran out";
        const parts = UCI.exec(uci);
        if (parts === null) return `'${uci}' isn't a move`;
        const [, from, to, promotion] = parts;
        let san: string;
        try {
            ({ san } = this.#position.move({ from, to, promotion }));
        } catch {
            return `${uci} isn't a legal move`;
        }
        const d = this.#data;
        d.moves.push(san);
        d.fens.push(this.#position.fen());
        d.lastMove = { from, to };

        const elapsed = Math.max(0, now - d.clock.since);
        this.#setLeft(color, Math.max(0, this.#left(color) - elapsed));
        d.clock.since = now;

        // Moving declines the other side's offer
        if (d.drawOffer === other(color)) {
            delete d.drawOffer;
        }

        const p = this.#position;
        const ending: Ending | undefined = p.isCheckmate()
            ? { kind: "checkmate", winner: color }
            : p.isStalemate()
              ? { kind: "stalemate" }
              : p.isInsufficientMaterial()
                ? { kind: "insufficient_material" }
                : p.isThreefoldRepetition()
                  ? { kind: "repetition" }
                  : p.isDrawByFiftyMoves()
                    ? { kind: "fifty_moves" }
                    : undefined;
        if (ending !== undefined) this.#end(ending, now);
        return undefined;
    }

    /**
     * Ends the game if the side to move's flag has fallen, giving whether it did. The other side
     * wins, unless it hasn't the material to mate with, when it's a draw.
     */
    flag(now: number): boolean {
        if (this.isOver) return false;
        const turn = this.turn;
        if (this.timeLeft(turn, now) > 0) return false;
        this.#end(
            this.#hasInsufficientMaterial(other(turn))
                ? { kind: "timeout_draw" }
                : { kind: "timeout", winner: other(turn) },
            now,
        );
        return true;
    }

    /** The side gives up, whoever's turn it is */
    resign(color: Side, now: number): string | undefined {
        if (this.isOver) return "The game has finished";
        this.#end({ kind: "resignation", winner: other(color) }, now);
        return undefined;
    }

    /** The side has left the game, which can't go on without them, so the other side wins */
    abandon(color: Side, now: number): string | undefined {
        if (this.isOver) return "The game has finished";
        this.#end({ kind: "abandonment", winner: other(color) }, now);
        return undefined;
    }

    /**
     * The side offers a draw, which stands until the other side moves, or accepts the other side's
     * offer if it stands, which ends the game
     */
    offerDraw(color: Side, now: number): string | undefined {
        if (this.isOver) return "The game has finished";
        if (this.#data.drawOffer === other(color)) {
            this.#end({ kind: "agreement" }, now);
        } else {
            this.#data.drawOffer = color;
        }
        return undefined;
    }

    /** The game as the app shows it, with each side's time left at `now` */
    snapshot(now: number): Snapshot {
        const p = this.#position;
        return {
            fen: p.fen(),
            turn: this.turn,
            moves: [...this.#data.moves],
            last_move: this.#data.lastMove === undefined ? null : { ...this.#data.lastMove },
            check: p.inCheck(),
            legal_moves: this.isOver
                ? []
                : p.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? "")),
            clock: {
                at: now,
                white_ms: this.timeLeft("white", now),
                black_ms: this.timeLeft("black", now),
                running: this.isOver ? null : this.turn,
            },
            draw_offer: this.#data.drawOffer ?? null,
            result: this.ending === undefined ? null : describe(this.ending),
        };
    }

    // Stops the clocks and records how the game ended
    #end(ending: Ending, now: number): void {
        const turn = this.turn;
        this.#setLeft(turn, this.timeLeft(turn, now));
        this.#data.clock.since = now;
        delete this.#data.drawOffer;
        this.#data.ending = ending;
    }

    #left(color: Side): number {
        return color === "white" ? this.#data.clock.whiteMs : this.#data.clock.blackMs;
    }

    #setLeft(color: Side, ms: number): void {
        if (color === "white") this.#data.clock.whiteMs = ms;
        else this.#data.clock.blackMs = ms;
    }

    /**
     * Whether the side couldn't mate however the other side played: no pawn, rook or queen, and a
     * lone king, one minor piece, or bishops all on one colour against nothing that could be mated
     * with them. As shakmaty judges it, for a flag falling against bare material.
     */
    #hasInsufficientMaterial(color: Side): boolean {
        const c: Color = color === "white" ? "w" : "b";
        const mine: { type: string; square: Square }[] = [];
        const theirs: { type: string; square: Square }[] = [];
        let bishopsOnLight = false;
        let bishopsOnDark = false;
        for (const row of this.#position.board()) {
            for (const piece of row) {
                if (piece === null) continue;
                (piece.color === c ? mine : theirs).push(piece);
                if (piece.type === "b") {
                    if (this.#position.squareColor(piece.square) === "light") bishopsOnLight = true;
                    else bishopsOnDark = true;
                }
            }
        }
        if (mine.some((p) => p.type === "p" || p.type === "r" || p.type === "q")) return false;
        if (mine.some((p) => p.type === "n")) {
            // A king and a knight mate only against a side with a piece to get in the way
            return mine.length <= 2 && !theirs.some((p) => p.type !== "k" && p.type !== "q");
        }
        if (mine.some((p) => p.type === "b")) {
            const sameColour = !(bishopsOnLight && bishopsOnDark);
            const pieces = [...mine, ...theirs];
            return sameColour && !pieces.some((p) => p.type === "p" || p.type === "n");
        }
        return true;
    }
}

/** The result as the card shows it, eg. "White won by checkmate" */
export function describe(ending: Ending): string {
    switch (ending.kind) {
        case "checkmate":
            return `${sideName(ending.winner)} won by checkmate`;
        case "resignation":
            return `${sideName(ending.winner)} won by resignation`;
        case "timeout":
            return `${sideName(ending.winner)} won on time`;
        case "abandonment":
            return `${sideName(ending.winner)} won by abandonment`;
        case "stalemate":
            return "Draw by stalemate";
        case "insufficient_material":
            return "Draw by insufficient material";
        case "repetition":
            return "Draw by threefold repetition";
        case "fifty_moves":
            return "Draw by the fifty-move rule";
        case "agreement":
            return "Draw by agreement";
        case "timeout_draw":
            return "Draw: time ran out against insufficient material";
    }
}

export function other(color: Side): Side {
    return color === "white" ? "black" : "white";
}

export function sideName(color: Side): string {
    return color === "white" ? "White" : "Black";
}

function side(color: Color): Side {
    return color === "w" ? "white" : "black";
}
