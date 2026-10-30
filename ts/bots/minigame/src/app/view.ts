// What the page needs of each game's view. The page (`main.ts`) connects to OpenChat, shows the
// lobby, which every game shares, and hands the game itself to the view for the `game` named in the
// shared state, or the end state: `race2048/view.ts` or `chess/view.ts`.
import type { MiniAppClient } from "@open-ic/openchat-botclient-ts/mini_app";

/** What every game's shared state, and end state, starts with */
export type BaseState = { version: number; game: string };

export type Seat = { id: string; name: string };

/** The lobby, as the game describes it before it starts */
export type Lobby = {
    /** What the game is, as HTML */
    blurb: string;
    seats: Seat[];
    /** For the player with the Start button, eg. "Start when everyone has joined." */
    hint: string;
};

export type ViewContext = {
    oc: MiniAppClient<unknown, unknown, unknown>;
    /** Shows a short message over the page */
    notice(text: string): void;
    /** Draws the page again */
    render(): void;
};

export interface GameView {
    /** The `game` in the shared state */
    readonly id: string;
    readonly title: string;
    /** The version of the shared state this view reads; a live state of another needs a newer page */
    readonly stateVersion: number;
    /** Attaches the view's own listeners, once, when the page learns which game it's showing */
    attach(root: HTMLElement, ctx: ViewContext): void;
    /** Whether the game hasn't started, when the page shows the shared lobby */
    isOpen(shared: BaseState): boolean;
    lobby(shared: BaseState): Lobby;
    /** Draws the live game, of `stateVersion`, into `body` */
    renderLive(body: HTMLElement, shared: BaseState): void;
    /**
     * Draws the finished game from its end state, which the card keeps for good, so older versions
     * are read too. False if it can't be read, when the page says only that the game is over.
     */
    renderEnd(body: HTMLElement, endState: unknown): boolean;
    /** The header's clock, or "" for a game that keeps its own */
    clock(): string;
    /** A key the view uses, eg. an arrow key for a move, which the page then keeps from scrolling */
    onKey(event: KeyboardEvent): boolean;
    /** A click on one of the view's `[data-action]` elements */
    onAction(action: string, el: HTMLElement): void;
}
