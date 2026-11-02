// Live updates over a WebSocket, for a game played live (`Game.receive`), eg. the maze race. The
// MiniApp service relays each state to everyone with the game open, but a state goes from the bot
// to the service, to each player's OpenChat, to their page, and the bot sends a few a second at
// most, which is too slow for players to see each other move. So a player's page also opens a
// socket to the bot, at `/live` on the bot's own origin, which the card's frame allows, and the
// bot sends each change to everyone connected to the game at once. The service still carries the
// game for spectators, who have no token, for anyone who opens it late, and for the card.
//
// The page's first message is its player token, `{ "type": "hello", "token": ".." }`, checked as
// a request's is, and the bot answers with the state, `{ "type": "state", "shared": {..} }`, then
// sends the state again whenever it changes. A move is `{ "type": "act", "body": {..} }`, which the
// game's `receive` takes; one it refuses is answered `{ "type": "error", "error": ".." }`. A token
// outlives a removal from the game by up to an hour, so every message is checked against the
// game's own list of who's in it. The bot pings every socket, and sends `{ "type": "beat" }`, so
// each side knows when the other's gone. A socket is closed with one of `CLOSE`'s codes.
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { miniAppGameKey, TokenError, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { Deps } from "./deps";

export const LIVE_PATH = "/live";

/** Why the bot closed a socket */
export const CLOSE = {
    /** A message that isn't one, eg. not JSON, or an act before the hello */
    BAD_MESSAGE: 4000,
    /** No hello in time, or a token that isn't the bot's */
    UNAUTHORISED: 4001,
    /** A token that's expired: the page gets a fresh one from OpenChat and comes back */
    EXPIRED: 4002,
    /** Someone who isn't in the game, or is no longer */
    NOT_PLAYING: 4003,
    /** A game that's over, or isn't played live */
    NO_GAME: 4004,
    /** Too many messages too fast */
    TOO_MANY: 4008,
} as const;

/** The most a message can be: a move is a few dozen bytes, a token a kilobyte or so */
const MAX_PAYLOAD = 4096;
/** A socket further behind than this misses states until it catches up: each is the latest */
const MAX_BUFFERED = 256 * 1024;

export type LiveOptions = {
    /** How long a socket has to say hello */
    helloMs?: number;
    /** How often the bot pings each socket, and drops one that didn't answer the last ping */
    heartbeatMs?: number;
    /** The messages a socket may send a second, on average, and at once */
    perSecond?: number;
    burst?: number;
};

type Client = {
    socket: WebSocket;
    userId: string;
    game: MiniAppGame;
    key: string;
};

type Connection = {
    socket: WebSocket;
    alive: boolean;
    /** Messages it may still send now, refilled at `perSecond` */
    allowance: number;
    refilledAt: number;
    client?: Client;
    saying: boolean;
};

export class LiveHub {
    readonly #deps: Deps;
    readonly #server = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
    readonly #connections = new Set<Connection>();
    /** Who's connected to each game, by `miniAppGameKey` */
    readonly #rooms = new Map<string, Set<Client>>();
    /** The games whose state is about to go out */
    readonly #due = new Set<string>();
    readonly #helloMs: number;
    readonly #perSecond: number;
    readonly #burst: number;
    readonly #heartbeat: NodeJS.Timeout;

    constructor(deps: Deps, options: LiveOptions = {}) {
        this.#deps = deps;
        this.#helloMs = options.helloMs ?? 10_000;
        this.#perSecond = options.perSecond ?? 20;
        this.#burst = options.burst ?? 40;
        this.#heartbeat = setInterval(() => this.#beat(), options.heartbeatMs ?? 15_000);
        this.#heartbeat.unref();
    }

    /** Takes the HTTP server's upgrades to `/live`, and turns away any other */
    attach(server: Server): void {
        server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            const path = new URL(req.url ?? "/", "http://localhost").pathname;
            if (path !== LIVE_PATH) {
                socket.destroy();
                return;
            }
            this.#server.handleUpgrade(req, socket, head, (ws) => this.#connected(ws));
        });
    }

    /** How many are connected to the game, eg. for a test */
    connectedTo(game: MiniAppGame): number {
        return this.#rooms.get(miniAppGameKey(game))?.size ?? 0;
    }

    /**
     * Sends the game's state to everyone connected to it, once, however many changes come in
     * meanwhile: called for each change, from wherever it came
     */
    changed(game: MiniAppGame): void {
        const key = miniAppGameKey(game);
        if (!this.#rooms.has(key) || this.#due.has(key)) return;
        this.#due.add(key);
        setImmediate(() => {
            this.#due.delete(key);
            this.#sendState(game, key);
        });
    }

    close(): void {
        clearInterval(this.#heartbeat);
        for (const connection of this.#connections) connection.socket.terminate();
        this.#server.close();
    }

    #connected(socket: WebSocket): void {
        const connection: Connection = {
            socket,
            alive: true,
            allowance: this.#burst,
            refilledAt: Date.now(),
            saying: false,
        };
        this.#connections.add(connection);
        const hello = setTimeout(() => {
            if (connection.client === undefined) {
                socket.close(CLOSE.UNAUTHORISED, "Send your token first");
            }
        }, this.#helloMs);
        socket.on("pong", () => {
            connection.alive = true;
        });
        socket.on("message", (data, isBinary) => this.#message(connection, data, isBinary));
        socket.on("close", () => {
            clearTimeout(hello);
            this.#connections.delete(connection);
            if (connection.client !== undefined) this.#leave(connection.client);
        });
        // A socket that errors is closed, which the close above tidies up after
        socket.on("error", () => {});
    }

    #message(connection: Connection, data: RawData, isBinary: boolean): void {
        const { socket } = connection;
        if (!this.#allow(connection)) {
            socket.close(CLOSE.TOO_MANY, "Too many messages");
            return;
        }
        let message: { type?: unknown; token?: unknown; body?: unknown };
        try {
            if (isBinary) throw new Error("Binary");
            message = JSON.parse(data.toString());
            if (message === null || typeof message !== "object") throw new Error("Not an object");
        } catch {
            socket.close(CLOSE.BAD_MESSAGE, "Messages are JSON objects");
            return;
        }
        if (connection.client === undefined) {
            if (
                message.type !== "hello" ||
                typeof message.token !== "string" ||
                connection.saying
            ) {
                socket.close(CLOSE.BAD_MESSAGE, "Send your token first");
                return;
            }
            connection.saying = true;
            void this.#hello(connection, message.token);
            return;
        }
        if (message.type !== "act") {
            socket.close(CLOSE.BAD_MESSAGE, "Unknown message");
            return;
        }
        this.#act(connection.client, message.body);
    }

    /** Takes one of the socket's allowance, if it has any left */
    #allow(connection: Connection): boolean {
        const now = Date.now();
        connection.allowance = Math.min(
            this.#burst,
            connection.allowance + ((now - connection.refilledAt) * this.#perSecond) / 1000,
        );
        connection.refilledAt = now;
        if (connection.allowance < 1) return false;
        connection.allowance--;
        return true;
    }

    async #hello(connection: Connection, token: string): Promise<void> {
        const { socket } = connection;
        let userId: string;
        let game: MiniAppGame;
        try {
            ({ userId, game } = (await this.#deps.tokens()).verifyPlayer(token));
        } catch (err) {
            if (err instanceof TokenError) {
                socket.close(
                    err.kind === "expired" ? CLOSE.EXPIRED : CLOSE.UNAUTHORISED,
                    err.message.slice(0, 120),
                );
            } else {
                console.error("Couldn't verify a live player's token:", err);
                socket.close(1011, "Couldn't verify the token");
            }
            return;
        }
        if (socket.readyState !== WebSocket.OPEN) return;
        const entry = this.#deps.store.get(game);
        if (entry === undefined) {
            socket.close(CLOSE.NO_GAME, "This game is over");
            return;
        }
        if (entry.play.receive === undefined) {
            socket.close(CLOSE.NO_GAME, "This game isn't played live");
            return;
        }
        if (!entry.play.isSeated(userId)) {
            socket.close(CLOSE.NOT_PLAYING, "You aren't in this game");
            return;
        }
        const client: Client = { socket, userId, game, key: miniAppGameKey(game) };
        connection.client = client;
        let room = this.#rooms.get(client.key);
        if (room === undefined) {
            room = new Set();
            this.#rooms.set(client.key, room);
        }
        room.add(client);
        socket.send(JSON.stringify({ type: "state", shared: entry.play.shared() }));
    }

    #act(client: Client, body: unknown): void {
        const entry = this.#deps.store.get(client.game);
        if (entry === undefined) {
            client.socket.close(CLOSE.NO_GAME, "This game is over");
            return;
        }
        const { play } = entry;
        if (!play.isSeated(client.userId) || play.receive === undefined) {
            client.socket.close(CLOSE.NOT_PLAYING, "You aren't in this game");
            return;
        }
        // The time may have run out since the last sweep: then the end is what everyone gets
        const endedNow = play.endIfTimeUp();
        const result = play.receive(client.userId, body);
        if (!result.ok) {
            client.socket.send(JSON.stringify({ type: "error", error: result.error }));
        }
        if (endedNow || result.changed) {
            this.#deps.store.save();
            this.#deps.publisher.publish(client.game);
            this.changed(client.game);
        }
    }

    #sendState(game: MiniAppGame, key: string): void {
        const room = this.#rooms.get(key);
        if (room === undefined) return;
        const entry = this.#deps.store.get(game);
        if (entry === undefined) {
            for (const client of room) client.socket.close(CLOSE.NO_GAME, "This game is over");
            return;
        }
        const message = JSON.stringify({ type: "state", shared: entry.play.shared() });
        for (const { socket } of room) {
            if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < MAX_BUFFERED) {
                socket.send(message);
            }
        }
    }

    #leave(client: Client): void {
        const room = this.#rooms.get(client.key);
        if (room === undefined) return;
        room.delete(client);
        if (room.size === 0) this.#rooms.delete(client.key);
    }

    // Drops each socket that didn't answer the last ping, and pings the rest. The page can't see a
    // ping, so it's sent a beat too, by which it knows the socket's still there.
    #beat(): void {
        const beat = JSON.stringify({ type: "beat" });
        for (const connection of this.#connections) {
            if (!connection.alive) {
                connection.socket.terminate();
                continue;
            }
            connection.alive = false;
            connection.socket.ping();
            if (connection.client !== undefined) connection.socket.send(beat);
        }
    }
}
