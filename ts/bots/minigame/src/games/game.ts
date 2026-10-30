// What every game the bot hosts looks like to the store, the handlers, the sweep and the publisher:
// who's in it, how it starts, whose turn it is, whether its clock has run out, and what everyone
// sees. A game's own moves are its own, under `handlers/api.ts`.

export type GameKind = "2048" | "chess";

export type Phase = "open" | "active" | "finished";

export interface Game {
    readonly kind: GameKind;
    readonly phase: Phase;
    /** When the game was made, for pruning one that never finishes */
    readonly createdAt: number;
    /** When it finished, once it has */
    readonly finishedAt: number | undefined;

    /** Whether the user has a seat, before the start */
    isSeated(userId: string): boolean;
    /** Whether the user is playing, which is only so once the game has started */
    isPlayer(userId: string): boolean;
    /**
     * Gives a user a seat, before the game starts. Undefined when they have one now, or why not,
     * for the service to show them, eg. "All 10 seats are taken".
     */
    join(userId: string, name: string): string | undefined;
    /**
     * The service says the user isn't in the game. Before the start their seat is freed; after it,
     * a game which can't go on without them ends. Whether the game changed.
     */
    leave(userId: string): boolean;
    /** Why the game can't start yet, or undefined when it can */
    cannotStart(): string | undefined;
    /**
     * Starts the game with everyone seated. Starting a game which has started does nothing more.
     * Returns the players' ids, as the service should record them.
     */
    start(): string[];
    /** The players whose turn it is, or none when it's everyone's at once, or the game's over */
    waitingFor(): string[];
    /**
     * Ends the game if its clock has run out, and says whether it did just now. Called every second
     * by the bot, and before every request, so a game ends on time whether or not anyone's playing.
     */
    endIfTimeUp(): boolean;
    /** The next state's `seq`, above every state published before */
    nextSeq(): number;
    /** The state everyone sees, with a `version` and the `game`'s id */
    shared(): unknown;
    /** The card's result once the game is over, eg. "White won by checkmate" */
    result(): string | undefined;
    /**
     * How the game ended, for the card to keep and hand to the app, once it's over: any JSON value
     * of at most 16 KB, or undefined to send none, when the card shows the image and the result
     */
    endState(): unknown;
    /** The game's whole state, for the store to write; the registry's `fromJson` reads it back */
    toJson(): unknown;
}

/** The most the service takes for how a game ended, serialized */
export const MAX_END_STATE_BYTES = 16 * 1024;

/**
 * How many bytes a JSON value takes serialized, as the service measures it: UTF-8 bytes, not
 * UTF-16 units, as `JSON.stringify(..).length` would give. `TextEncoder` is what both Node and the
 * browser have, as this is shared with the app's build.
 */
export function jsonBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}
