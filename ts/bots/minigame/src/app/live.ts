// The live socket to the bot (`src/live.ts`), for a game played live, eg. the maze race or
// ChatMan: opened once the game's on, for a player, and opened again if it drops, waiting longer
// each time, with a fresh token if the old one's expired, until the game is over. The page's moves
// go over it, and every state comes back on it. While it's down, the view sends its moves over
// HTTP instead, and the states come through OpenChat.
import type { ViewContext } from "./view";

/** A socket that's said nothing for this long, beats included, is taken to be gone */
const SILENT_MS = 40_000;

export type LiveEvents<S> = {
    /** Whether the page wants a socket: the player's in a game that's on */
    wanted(): boolean;
    state(shared: S): void;
    /** The socket's just come up, or back: what the bot may not have had goes again */
    opened(send: (body: unknown) => void): void;
    /** The bot refused something, eg. a move into a wall */
    error(text: string): void;
    /** Anything that changes what the page shows, eg. the socket going */
    changed(): void;
};

export class LiveSocket<S> {
    readonly #ctx: () => ViewContext | undefined;
    readonly #events: LiveEvents<S>;
    #socket: WebSocket | undefined;
    #live = false;
    #heardAt = 0;
    #retryMs = 1000;
    #retryTimer: ReturnType<typeof setTimeout> | undefined;
    #watchdog: ReturnType<typeof setInterval> | undefined;
    #unavailable = false;

    constructor(ctx: () => ViewContext | undefined, events: LiveEvents<S>) {
        this.#ctx = ctx;
        this.#events = events;
    }

    /** Whether the socket's up, and has had its first state */
    get live(): boolean {
        return this.#live;
    }

    /** Whether the bot's said a socket won't do, eg. the player's no longer in the game */
    get unavailable(): boolean {
        return this.#unavailable;
    }

    connect(): void {
        if (
            this.#socket !== undefined ||
            this.#unavailable ||
            this.#retryTimer !== undefined ||
            !this.#events.wanted()
        ) {
            return;
        }
        const token = this.#ctx()?.oc.token;
        if (token === undefined) return;
        // A socket that's gone quiet without closing is closed, so it opens again
        this.#watchdog ??= setInterval(() => {
            if (this.#socket !== undefined && this.#live && Date.now() - this.#heardAt > SILENT_MS) {
                this.#socket.close();
            }
        }, 1000);
        const url = new URL("/live", location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(url);
        this.#socket = ws;
        this.#heardAt = Date.now();
        const send = (body: unknown) => ws.send(JSON.stringify({ type: "act", body }));
        ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token }));
        ws.onmessage = (event) => {
            this.#heardAt = Date.now();
            let message: { type?: string; shared?: S; error?: string };
            try {
                message = JSON.parse(String(event.data));
            } catch {
                return;
            }
            if (message.type === "state" && message.shared !== undefined) {
                const first = !this.#live;
                this.#live = true;
                this.#retryMs = 1000;
                this.#events.state(message.shared);
                if (first) this.#events.opened(send);
                this.#events.changed();
            } else if (message.type === "error" && message.error !== undefined) {
                this.#events.error(message.error);
            }
        };
        ws.onclose = (event) => {
            if (this.#socket === ws) {
                this.#socket = undefined;
                this.#live = false;
            }
            if (event.code === 4001 || event.code === 4003 || event.code === 4004) {
                // The bot won't have it: moves go over HTTP, and the states through OpenChat
                this.#unavailable = true;
            } else if (event.code === 4002) {
                void this.#ctx()
                    ?.oc.refreshToken()
                    .then(() => this.connect())
                    .catch(() => {});
            } else if (this.#events.wanted()) {
                this.#retryTimer = setTimeout(() => {
                    this.#retryTimer = undefined;
                    this.connect();
                }, this.#retryMs);
                this.#retryMs = Math.min(10_000, this.#retryMs * 2);
            }
            this.#events.changed();
        };
    }

    disconnect(): void {
        clearTimeout(this.#retryTimer);
        this.#retryTimer = undefined;
        const ws = this.#socket;
        this.#socket = undefined;
        this.#live = false;
        ws?.close(1000);
    }

    /** Sends a move over the socket, if it's up: false if it isn't, for the view to use HTTP */
    send(body: unknown): boolean {
        if (this.#socket === undefined || !this.#live) return false;
        this.#socket.send(JSON.stringify({ type: "act", body }));
        return true;
    }
}
