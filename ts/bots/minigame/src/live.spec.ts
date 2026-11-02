// The live socket, over a real server and real sockets: who it lets in, what it sends whom, and
// when it closes
import http from "node:http";
import type { AddressInfo } from "node:net";
import { GroupChatIdentifier, TokenError, type MiniAppGame } from "@open-ic/openchat-botclient-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { Deps } from "./deps";
import { ChessGame } from "./games/chess/chess";
import { wayOut } from "./games/maze/maze";
import { MazeRace } from "./games/maze/race";
import type { SharedState } from "./games/maze/types";
import { CLOSE, LiveHub, type LiveOptions } from "./live";
import { GameStore } from "./store";

const game: MiniAppGame = { chat: new GroupChatIdentifier("aaaaa-aa"), messageId: 1n };

type Message = { type: string; shared?: SharedState; error?: string };

let cleanup: (() => void)[] = [];
afterEach(() => {
    for (const done of cleanup.splice(0)) done();
});

/** A hub on a server of its own, with a maze race for alice and bob, started unless said */
async function setUp(options: LiveOptions & { start?: boolean } = {}) {
    const store = new GameStore();
    const race = MazeRace.create({ random: () => 0.25 });
    race.join("alice", "Alice");
    race.join("bob", "Bob");
    if (options.start !== false) race.start();
    store.create(game, race);
    const publish = vi.fn();
    // A token is "t-<user id>"; "expired" has expired; anything else isn't one
    const tokens = {
        verifyPlayer: (token: unknown) => {
            if (token === "expired") throw new TokenError("expired", "The token has expired");
            if (typeof token !== "string" || !token.startsWith("t-")) {
                throw new TokenError("invalid", "Not a token");
            }
            return { bot: "bot", game, userId: token.slice(2) };
        },
    };
    const deps = { store, publisher: { publish }, tokens: async () => tokens } as unknown as Deps;
    const hub = new LiveHub(deps, { helloMs: 300, heartbeatMs: 60_000, ...options });
    const server = http.createServer();
    hub.attach(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cleanup.push(() => {
        hub.close();
        server.close();
    });
    return { store, race, publish, hub, url };
}

/** A socket, with what it's been sent and how it closed */
function connect(url: string, path = "/live") {
    const socket = new WebSocket(url + path);
    const messages: Message[] = [];
    const waiting: ((m: Message) => void)[] = [];
    socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as Message;
        const next = waiting.shift();
        if (next !== undefined) next(message);
        else messages.push(message);
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
        socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    const opened = new Promise<void>((resolve, reject) => {
        socket.on("open", () => resolve());
        socket.on("error", reject);
    });
    return {
        socket,
        opened,
        closed,
        /** The next message it's sent */
        next: () =>
            new Promise<Message>((resolve) => {
                const queued = messages.shift();
                if (queued !== undefined) resolve(queued);
                else waiting.push(resolve);
            }),
        send: (value: unknown) => socket.send(JSON.stringify(value)),
    };
}

/** Alice's socket, said hello, with the first state it got */
async function hello(url: string, token = "t-alice") {
    const client = connect(url);
    await client.opened;
    client.send({ type: "hello", token });
    const first = await client.next();
    return { ...client, first };
}

describe("the live socket", () => {
    it("answers a hello with the state, and sends each change to everyone connected", async () => {
        const { race, publish, hub, url } = await setUp();
        const alice = await hello(url, "t-alice");
        const bob = await hello(url, "t-bob");
        expect(alice.first).toMatchObject({ type: "state", shared: { phase: "active" } });
        expect(hub.connectedTo(game)).toBe(2);

        const [move] = wayOut(race.maze!);
        alice.send({ type: "act", body: { move, n: 1 } });
        const [toAlice, toBob] = await Promise.all([alice.next(), bob.next()]);
        expect(toAlice).toEqual(toBob);
        expect(toBob.shared?.racers[0]).toMatchObject({ id: "alice", ack: 1, moves: 1 });
        // It goes through the service too, for spectators and the card
        expect(publish).toHaveBeenCalledWith(game);
    });

    it("sends changes from elsewhere, once however many come in at once", async () => {
        const { race, hub, url } = await setUp();
        const alice = await hello(url);
        race.data.players[1].x = 1;
        hub.changed(game);
        hub.changed(game);
        const sent = await alice.next();
        expect(sent.shared?.racers[1].x).toBe(1);
        // Nothing more: the second change was in the first message
        alice.send({ type: "act", body: { move: wayOut(race.maze!)[0], n: 1 } });
        expect((await alice.next()).shared?.racers[0].ack).toBe(1);
    });

    it("waits the game's own pace before sending a change, for a game that asks to", async () => {
        const { race, hub, url } = await setUp();
        const alice = await hello(url);
        Object.assign(race, { liveEveryMs: () => 60 });
        const from = Date.now();
        race.data.players[1].x = 1;
        hub.changed(game);
        race.data.players[1].x = 2;
        hub.changed(game);
        const sent = await alice.next();
        expect(Date.now() - from).toBeGreaterThanOrEqual(50);
        // Both changes, in the one message
        expect(sent.shared?.racers[1].x).toBe(2);
    });

    it("says why a move was refused", async () => {
        const { url } = await setUp();
        const alice = await hello(url);
        alice.send({ type: "act", body: { move: "sideways", n: 1 } });
        expect(await alice.next()).toEqual({
            type: "error",
            error: "A move is a direction and its number",
        });
    });

    it("closes a socket that doesn't say hello in time", async () => {
        const { url } = await setUp({ helloMs: 50 });
        const quiet = connect(url);
        await quiet.opened;
        expect(await quiet.closed).toEqual({
            code: CLOSE.UNAUTHORISED,
            reason: "Send your token first",
        });
    });

    it("closes for a token that won't do, telling an expired one apart", async () => {
        const { url } = await setUp();
        const bad = connect(url);
        await bad.opened;
        bad.send({ type: "hello", token: "nonsense" });
        expect((await bad.closed).code).toBe(CLOSE.UNAUTHORISED);
        const old = connect(url);
        await old.opened;
        old.send({ type: "hello", token: "expired" });
        expect(await old.closed).toEqual({ code: CLOSE.EXPIRED, reason: "The token has expired" });
    });

    it("closes for someone who isn't in the game, or no longer is", async () => {
        const { race, url } = await setUp({ start: false });
        const carol = connect(url);
        await carol.opened;
        carol.send({ type: "hello", token: "t-carol" });
        expect((await carol.closed).code).toBe(CLOSE.NOT_PLAYING);
        // Bob's in, then leaves before the start: his next message closes his socket
        const bob = await hello(url, "t-bob");
        race.leave("bob");
        bob.send({ type: "act", body: { move: "down", n: 1 } });
        expect(await bob.closed).toEqual({
            code: CLOSE.NOT_PLAYING,
            reason: "You aren't in this game",
        });
    });

    it("closes for a game that's over or isn't played live", async () => {
        const { store, url } = await setUp();
        store.delete(game);
        const gone = connect(url);
        await gone.opened;
        gone.send({ type: "hello", token: "t-alice" });
        expect(await gone.closed).toEqual({ code: CLOSE.NO_GAME, reason: "This game is over" });

        const chess = ChessGame.create();
        chess.join("alice", "Alice");
        store.create(game, chess);
        const board = connect(url);
        await board.opened;
        board.send({ type: "hello", token: "t-alice" });
        expect(await board.closed).toEqual({
            code: CLOSE.NO_GAME,
            reason: "This game isn't played live",
        });
    });

    it("closes for what isn't a message, and for anything before the hello", async () => {
        const { url } = await setUp();
        const garbled = connect(url);
        await garbled.opened;
        garbled.socket.send("not json");
        expect((await garbled.closed).code).toBe(CLOSE.BAD_MESSAGE);
        const early = connect(url);
        await early.opened;
        early.send({ type: "act", body: { move: "down", n: 1 } });
        expect((await early.closed).code).toBe(CLOSE.BAD_MESSAGE);
        const alice = await hello(url);
        alice.send({ type: "dance" });
        expect((await alice.closed).code).toBe(CLOSE.BAD_MESSAGE);
    });

    it("closes a socket that sends too much too fast", async () => {
        const { url } = await setUp({ perSecond: 5, burst: 10 });
        const alice = await hello(url);
        for (let n = 1; n <= 20; n++) alice.send({ type: "act", body: { move: "sideways", n } });
        expect((await alice.closed).code).toBe(CLOSE.TOO_MANY);
    });

    it("turns away a socket on any other path", async () => {
        const { url } = await setUp();
        const elsewhere = connect(url, "/elsewhere");
        await expect(elsewhere.opened).rejects.toThrow();
    });

    it("beats, so a page knows its socket's still there", async () => {
        const { url } = await setUp({ heartbeatMs: 30 });
        const alice = await hello(url);
        expect(await alice.next()).toEqual({ type: "beat" });
    });
});
