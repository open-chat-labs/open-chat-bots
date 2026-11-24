// Backgammon: each player has 15 checkers, which they move round the board's 24 points by the roll
// of two dice, towards their own home board, the last six points, and then off. A checker can land
// on any point but one where the other player has two or more; landing on a point where they have
// one, a blot, hits it, and it goes to the bar, from where it has to come back in, into its own
// starting quarter, before its owner can move anything else. Once all of a player's checkers are
// home, they can bear them off, with the die for a checker's point, or a higher die for the
// furthest one in. Doubles are played four times. A player has to use as many of their dice as
// they can, and if they can use only one of two, the higher if they can. The first to bear off all
// 15 wins: a gammon if the other has borne off none, a backgammon if the other also has one on the
// bar or in the winner's home board. Built here from scratch, with no doubling cube.
//
// Each player counts the points from their own side: they move from their 24 point down to their
// 1 point and then off, so one player's point p is the other's 25 - p. The bar is 25, as a checker
// there comes in on 25 less the die, and off is 0.
//
// A move is a whole turn: the dice, higher first, then each checker moved, a die at a time, from
// the mover's own point to point, eg. "31:8/5,6/5", "62:bar/23,13/7", "55:6/off,6/off,6/1,6/1",
// or "64:" for a roll that gives no move. The bot rolls the dice, which the position is told
// (`rolled`), and the move made with them carries them, so a replay needs no roll.
import type { Position, Seat } from "../duel/types";

export const OFF = 0;
export const BAR = 25;
export const CHECKERS = 15;

/** The checkers each player starts with, by their own point */
const START: Record<number, number> = { 24: 2, 13: 5, 8: 3, 6: 5 };

/** A turn's move: the dice, then its checkers' moves */
export const MOVE =
    /^([1-6])([1-6]):((?:bar|\d{1,2})\/(?:off|\d{1,2})(?:,(?:bar|\d{1,2})\/(?:off|\d{1,2})){0,3})?$/;

/** A checker moved by one die, from the mover's own point to point: 25 the bar, 0 off */
export type Step = { from: number; to: number };

/** A step with the die it used */
export type DieStep = Step & { die: number };

/** The two dice, the higher first */
export type Dice = [number, number];

/** How many points a win is worth: a single game, a gammon or a backgammon */
export type WinKind = 1 | 2 | 3;

/** What the last turn did, for the page to show */
export type LastTurn = {
    seat: Seat;
    dice: Dice;
    steps: DieStep[];
    /** The points, the mover's, where they hit a blot */
    hits: number[];
};

/** Each player's checkers, by their own point: 0 off, 1 to 24, 25 the bar */
type Checkers = number[];

/** Where a player's checkers are, for a test: how many on a point, or the bar */
export type CheckerSpec = Partial<Record<number | "bar", number>>;

/** "bar", "off" or the point's number */
export function pointName(point: number): string {
    return point === BAR ? "bar" : point === OFF ? "off" : String(point);
}

export function stepName(step: Step): string {
    return `${pointName(step.from)}/${pointName(step.to)}`;
}

export function diceName(dice: Dice): string {
    return `${dice[0]}${dice[1]}`;
}

/** The dice a roll names, eg. "31", the higher first, or undefined */
export function parseDice(roll: string): Dice | undefined {
    if (!/^[1-6][1-6]$/.test(roll)) return undefined;
    const a = Number(roll[0]);
    const b = Number(roll[1]);
    return a >= b ? [a, b] : undefined;
}

/** A roll of two dice for the side to move. The first of the game is never a double. */
export function rollDice(random: () => number, first: boolean): string {
    for (;;) {
        const a = 1 + Math.floor(random() * 6);
        const b = 1 + Math.floor(random() * 6);
        if (first && a === b) continue;
        return diceName(a >= b ? [a, b] : [b, a]);
    }
}

/** The dice to play: both, or four of a double */
function diceList(dice: Dice): number[] {
    return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice];
}

function parsePoint(text: string, bar: string): number | undefined {
    if (text === bar) return bar === "bar" ? BAR : OFF;
    const point = Number(text);
    return Number.isInteger(point) && point >= 1 && point <= 24 ? point : undefined;
}

/** A move's dice and steps, or undefined if it isn't one */
export function parseMove(move: string): { dice: Dice; steps: Step[] } | undefined {
    const parts = MOVE.exec(move);
    if (parts === null) return undefined;
    const dice = parseDice(parts[1] + parts[2]);
    if (dice === undefined) return undefined;
    const steps: Step[] = [];
    for (const text of parts[3] === undefined ? [] : parts[3].split(",")) {
        const [a, b] = text.split("/");
        const from = parsePoint(a, "bar");
        const to = parsePoint(b, "off");
        if (from === undefined || to === undefined || to >= from) return undefined;
        steps.push({ from, to });
    }
    return { dice, steps };
}

/** Where the checker on the mover's point lands with the die, if it can move: 0 is off */
function target(me: Checkers, them: Checkers, from: number, die: number): number | undefined {
    if (me[from] === 0) return undefined;
    // A checker on the bar comes in before any other moves
    if (me[BAR] > 0 && from !== BAR) return undefined;
    const to = from - die;
    if (to >= 1) return them[25 - to] >= 2 ? undefined : to;
    // Bearing off: only once every checker's home, and with a higher die than the point only from
    // the furthest one in
    for (let p = 7; p <= BAR; p++) if (me[p] > 0) return undefined;
    if (to < 0) for (let p = from + 1; p <= 6; p++) if (me[p] > 0) return undefined;
    return OFF;
}

/** Moves the checker, hitting a blot where it lands: whether it hit one */
function apply(me: Checkers, them: Checkers, from: number, to: number): boolean {
    me[from]--;
    if (to === OFF) {
        me[OFF]++;
        return false;
    }
    me[to]++;
    if (them[25 - to] === 1) {
        them[25 - to] = 0;
        them[BAR]++;
        return true;
    }
    return false;
}

/** The most of the dice that can be played, trying each order */
function mostPlayable(me: Checkers, them: Checkers, dice: readonly number[]): number {
    if (dice.length === 0) return 0;
    let best = 0;
    const tried = new Set<number>();
    for (let i = 0; i < dice.length; i++) {
        const die = dice[i];
        if (tried.has(die)) continue;
        tried.add(die);
        const rest = [...dice.slice(0, i), ...dice.slice(i + 1)];
        for (let from = BAR; from >= 1; from--) {
            const to = target(me, them, from, die);
            if (to === undefined) continue;
            const m = me.slice();
            const t = them.slice();
            apply(m, t, from, to);
            best = Math.max(best, 1 + mostPlayable(m, t, rest));
            if (best === dice.length) return best;
        }
    }
    return best;
}

/**
 * A turn as it's being made, a checker at a time: the board as it stands, the dice left, and the
 * checkers that can move next, which are only those that still leave a whole turn to be played.
 * The page builds the player's turn with one, and the board checks a move with one.
 */
export class Turn {
    readonly seat: Seat;
    readonly dice: Dice;
    /** How many of the dice the turn has to use */
    readonly length: number;
    readonly steps: DieStep[] = [];
    readonly hits: number[] = [];
    readonly #start: [Checkers, Checkers];
    #me: Checkers;
    #them: Checkers;
    #left: number[];
    /** Whether, of two dice, only one can be used, and so the higher has to be if it can be */
    readonly #higherOnly: boolean;

    constructor(checkers: readonly [Checkers, Checkers], seat: Seat, dice: Dice) {
        this.seat = seat;
        this.dice = dice;
        this.#start = [checkers[0].slice(), checkers[1].slice()];
        this.#me = checkers[seat].slice();
        this.#them = checkers[seat === 0 ? 1 : 0].slice();
        this.#left = diceList(dice);
        this.length = mostPlayable(this.#me, this.#them, this.#left);
        this.#higherOnly =
            this.length === 1 &&
            dice[0] !== dice[1] &&
            mostPlayable(this.#me, this.#them, [dice[0]]) === 1;
    }

    /** The mover's checkers as they stand, by their own point */
    get mine(): readonly number[] {
        return this.#me;
    }

    /** The other player's, by their own point */
    get theirs(): readonly number[] {
        return this.#them;
    }

    /** The dice still to play */
    get left(): readonly number[] {
        return this.#left;
    }

    /** Whether the turn has used all the dice it has to */
    get done(): boolean {
        return this.steps.length === this.length;
    }

    /** The checkers' moves that can be made next, each with the die it uses */
    options(): DieStep[] {
        const options: DieStep[] = [];
        for (let from = BAR; from >= 1; from--) {
            for (const die of this.#usable()) {
                const to = target(this.#me, this.#them, from, die);
                if (to === undefined || options.some((o) => o.from === from && o.to === to)) {
                    continue;
                }
                if (this.#leavesATurn(from, to, die)) options.push({ from, to, die });
            }
        }
        return options;
    }

    // The different dice left that can be played next, the lower first, so that a checker borne
    // off with either uses the lower
    #usable(): number[] {
        if (this.done) return [];
        const dice = [...new Set(this.#left)].sort((a, b) => a - b);
        return this.#higherOnly ? dice.filter((die) => die === this.dice[0]) : dice;
    }

    // Whether, after the checker's moved with the die, the rest of the turn can still be played
    #leavesATurn(from: number, to: number, die: number): boolean {
        const rest = [...this.#left];
        rest.splice(rest.indexOf(die), 1);
        const m = this.#me.slice();
        const t = this.#them.slice();
        apply(m, t, from, to);
        return mostPlayable(m, t, rest) === this.length - this.steps.length - 1;
    }

    /** Moves a checker, if it's one of the options, giving why not if it isn't */
    play(step: Step): string | undefined {
        const die = this.#usable().find(
            (d) =>
                target(this.#me, this.#them, step.from, d) === step.to &&
                this.#leavesATurn(step.from, step.to, d),
        );
        const option = die === undefined ? undefined : { from: step.from, to: step.to, die };
        if (option === undefined) {
            return this.done
                ? "That's more checkers than the dice move"
                : `You can't move ${stepName(step)}`;
        }
        if (apply(this.#me, this.#them, option.from, option.to)) this.hits.push(option.to);
        this.#left.splice(this.#left.indexOf(option.die), 1);
        this.steps.push(option);
        return undefined;
    }

    /** Takes the last checker's move back */
    undo(): void {
        const steps = this.steps.slice(0, -1);
        this.#me = this.#start[this.seat].slice();
        this.#them = this.#start[this.seat === 0 ? 1 : 0].slice();
        this.#left = diceList(this.dice);
        this.steps.length = 0;
        this.hits.length = 0;
        for (const step of steps) this.play(step);
    }

    /** The turn as a move, eg. "31:8/5,6/5" */
    move(): string {
        return `${diceName(this.dice)}:${this.steps.map(stepName).join(",")}`;
    }
}

export class Backgammon implements Position<string> {
    /** Each player's checkers, by their own point: 0 off, 1 to 24, 25 the bar */
    readonly #checkers: [Checkers, Checkers];
    #turn: Seat = 0;
    /** The dice the side to move rolled, once the bot's said */
    #dice?: Dice;
    #moves = 0;
    #outcome?: { winner: Seat; kind: WinKind };
    #last?: LastTurn;

    constructor() {
        const side = () => {
            const checkers = new Array(26).fill(0);
            for (const [point, n] of Object.entries(START)) checkers[Number(point)] = n;
            return checkers;
        };
        this.#checkers = [side(), side()];
    }

    /**
     * A board from each player's checkers, by their own point, for a test of a position play
     * doesn't reach quickly: `{ 6: 2, bar: 1 }`, with what's not on the board borne off
     */
    static from(mine: CheckerSpec, theirs: CheckerSpec, turn: Seat = 0): Backgammon {
        const board = new Backgammon();
        const fill = (spec: CheckerSpec, seat: Seat) => {
            const checkers = new Array(26).fill(0);
            for (const [point, n] of Object.entries(spec)) {
                checkers[point === "bar" ? BAR : Number(point)] = n ?? 0;
            }
            const on = checkers.reduce((a, b) => a + b, 0);
            if (on > CHECKERS) throw new Error("A player has 15 checkers");
            checkers[OFF] = CHECKERS - on;
            board.#checkers[seat] = checkers;
        };
        fill(turn === 0 ? mine : theirs, 0);
        fill(turn === 0 ? theirs : mine, 1);
        board.#turn = turn;
        return board;
    }

    get turn(): Seat {
        return this.#turn;
    }

    get outcome(): { winner: Seat; kind: WinKind } | undefined {
        return this.#outcome;
    }

    /** The dice the side to move has to play, once rolled */
    get dice(): Dice | undefined {
        return this.#dice;
    }

    /** How many turns have been played */
    get moves(): number {
        return this.#moves;
    }

    /** What the last turn did */
    get last(): LastTurn | undefined {
        return this.#last;
    }

    /** The seat's checkers, by its own point: 0 off, 1 to 24, 25 the bar */
    checkers(seat: Seat): readonly number[] {
        return this.#checkers[seat];
    }

    /** How far the seat's checkers have to go, all told: its pip count */
    pips(seat: Seat): number {
        return this.#checkers[seat].reduce((sum, n, point) => sum + n * point, 0);
    }

    /** The side to move rolled the dice, eg. "31" */
    rolled(roll: string): void {
        if (this.#outcome !== undefined) return;
        this.#dice = parseDice(roll);
    }

    /** The side to move's turn, a checker at a time, with the dice they rolled */
    turnWith(dice: Dice): Turn {
        return new Turn(this.#checkers, this.#turn, dice);
    }

    /** The move that stands for no move, when the side to move's dice give them none */
    noMove(): string | undefined {
        if (this.#outcome !== undefined || this.#dice === undefined) return undefined;
        return this.turnWith(this.#dice).length === 0 ? `${diceName(this.#dice)}:` : undefined;
    }

    /** Every different turn the dice allow, by where they leave the checkers */
    legalMoves(): string[] {
        if (this.#outcome !== undefined || this.#dice === undefined) return [];
        const found = new Map<string, string>();
        const search = (turn: Turn) => {
            if (turn.done) {
                found.set(`${turn.mine.join()}|${turn.theirs.join()}`, turn.move());
                return;
            }
            for (const option of turn.options()) {
                turn.play(option);
                search(turn);
                turn.undo();
            }
        };
        search(this.turnWith(this.#dice));
        return [...found.values()];
    }

    /** Plays the side to move's turn, eg. "31:8/5,6/5", giving why not if it can't be played */
    play(move: string): string | undefined {
        if (this.#outcome !== undefined) return "The game has finished";
        const parsed = parseMove(move);
        if (parsed === undefined) return "That isn't a move";
        if (
            this.#dice !== undefined &&
            (parsed.dice[0] !== this.#dice[0] || parsed.dice[1] !== this.#dice[1])
        ) {
            return "Those aren't your dice";
        }
        const turn = this.turnWith(parsed.dice);
        for (const step of parsed.steps) {
            const error = turn.play(step);
            if (error !== undefined) return error;
        }
        if (!turn.done) {
            return turn.length === 1
                ? "You have to move a checker"
                : `Your dice have ${turn.length} moves to make`;
        }
        const seat = this.#turn;
        const them: Seat = seat === 0 ? 1 : 0;
        this.#checkers[seat] = turn.mine.slice();
        this.#checkers[them] = turn.theirs.slice();
        this.#last = { seat, dice: parsed.dice, steps: [...turn.steps], hits: [...turn.hits] };
        this.#dice = undefined;
        this.#moves++;
        if (this.#checkers[seat][OFF] === CHECKERS) {
            this.#outcome = { winner: seat, kind: this.#winKind(them) };
        } else {
            this.#turn = them;
        }
        return undefined;
    }

    // A gammon if the loser's borne off none, a backgammon if they've also a checker on the bar or
    // in the winner's home board, their own 19 to 24 points
    #winKind(loser: Seat): WinKind {
        const checkers = this.#checkers[loser];
        if (checkers[OFF] > 0) return 1;
        for (let p = 19; p <= BAR; p++) if (checkers[p] > 0) return 3;
        return 2;
    }
}
