import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    MiniAppClient,
    connectToOpenChat,
    tokenExpiry,
    type MiniAppMessageEvent,
    type MiniAppRole,
    type MiniAppState,
    type MiniAppToOpenChat,
    type MiniAppWindow,
} from "./index";

const OPENCHAT = "https://oc.app";
// Where the bot serves the app
const APP = "https://uno.example.com/app";
const NOW = 1_800_000_000_000;
const USER = "rdmx6-jaaaa-aaaaa-aaadq-cai";

// A player token as the MiniApp service signs one, expiring in `seconds`. Only its claims are read
// in the browser.
function token(seconds: number): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "ES256" })}.${encode({ exp: NOW / 1000 + seconds, user_id: USER })}.sig`;
}

// The page's window, framed by OpenChat's
class FakeWindow implements MiniAppWindow {
    readonly posted: { message: MiniAppToOpenChat; targetOrigin: string }[] = [];
    readonly location = { href: APP };
    readonly parent = {
        postMessage: (message: MiniAppToOpenChat, targetOrigin: string) => {
            this.posted.push({ message, targetOrigin });
        },
    };
    #listeners = new Set<(event: MiniAppMessageEvent) => void>();

    addEventListener(_: "message", listener: (event: MiniAppMessageEvent) => void) {
        this.#listeners.add(listener);
    }

    removeEventListener(_: "message", listener: (event: MiniAppMessageEvent) => void) {
        this.#listeners.delete(listener);
    }

    get listening(): number {
        return this.#listeners.size;
    }

    // A message from OpenChat, unless another source or origin is given
    send(data: unknown, from: { origin?: string; source?: unknown } = {}) {
        const event = {
            data,
            origin: from.origin ?? OPENCHAT,
            source: "source" in from ? from.source : this.parent,
        };
        for (const listener of [...this.#listeners]) {
            listener(event);
        }
    }

    kinds(): string[] {
        return this.posted.map((p) => p.message.kind);
    }
}

function initialise(win: FakeWindow, change: { role?: MiniAppRole; seconds?: number } = {}) {
    const { role = "player", seconds = 3600 } = change;
    win.send({
        kind: "initialise_mini_app",
        role,
        user_id: USER,
        token: role === "player" ? token(seconds) : undefined,
        dark_mode: true,
        locale: "fr",
    });
}

async function connected(
    role: MiniAppRole = "player",
    options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<[MiniAppClient, FakeWindow]> {
    const win = new FakeWindow();
    const connecting = connectToOpenChat({ window: win, ...options });
    initialise(win, { role });
    return [await connecting, win];
}

function state(seq: number, part?: unknown) {
    return { kind: "mini_app_state", seq, shared: { seq }, private: part };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("connectToOpenChat", () => {
    test("says the app is ready, to any origin, then takes a player's role, token, theme and language", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });

        expect(win.posted).toEqual([{ message: { kind: "mini_app_ready" }, targetOrigin: "*" }]);
        initialise(win);
        const client = await connecting;

        expect(client.role).toBe("player");
        expect(client.userId).toBe(USER);
        expect(client.token).toBe(token(3600));
        expect(client.darkMode).toBe(true);
        expect(client.locale).toBe("fr");
        expect(client.state).toBeUndefined();
        expect(client.openChatOrigin).toBe(OPENCHAT);
    });

    test("takes a spectator, who has no token", async () => {
        const [client] = await connected("spectator");

        expect(client.role).toBe("spectator");
        expect(client.token).toBeUndefined();
        await expect(client.refreshToken()).rejects.toThrow("Only a player has a token");
    });

    test("ignores messages from anything but the window it's framed in", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, timeoutMs: 1000 });

        win.send(
            { kind: "initialise_mini_app", role: "player", user_id: "forged", token: "forged" },
            { source: {}, origin: "https://evil.example" },
        );
        win.send({ kind: "mini_app_token", token: "early" });
        win.send({ kind: "initialise_mini_app", role: "player" });
        win.send({ kind: "initialise_mini_app", role: "owner", user_id: USER });
        win.send("initialise_mini_app");
        initialise(win);

        const client = await connecting;
        expect([client.userId, client.token]).toEqual([USER, token(3600)]);
    });

    test("keeps a state sent before the app was initialised", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });

        win.send(state(1, { hand: [1] }));
        win.send(state(2), { source: {} });
        initialise(win);

        expect((await connecting).state).toEqual({
            seq: 1,
            shared: { seq: 1 },
            private: { hand: [1] },
        });
    });

    test("fills in a missing theme or language", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });
        win.send({ kind: "initialise_mini_app", role: "spectator", user_id: USER });
        const client = await connecting;

        expect([client.darkMode, client.locale]).toEqual([false, "en"]);
    });

    test("rejects if OpenChat doesn't answer in time, and stops listening", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, timeoutMs: 1000 });
        const rejected = expect(connecting).rejects.toThrow("OpenChat didn't initialise the app");

        vi.advanceTimersByTime(1000);

        await rejected;
        expect(win.listening).toBe(0);
    });

    test("rejects outside a frame", async () => {
        const win = new FakeWindow();
        Object.defineProperty(win, "parent", { value: win });

        await expect(connectToOpenChat({ window: win })).rejects.toThrow("isn't in a frame");
    });
});

describe("MiniAppClient's state", () => {
    test("is each newer state, with the player's own part", async () => {
        const [client, win] = await connected();
        const states: MiniAppState[] = [];
        const stop = client.onStateChange((s) => states.push(s));

        win.send(state(1, { hand: [1, 2] }));
        win.send(state(3, { hand: [2] }));
        stop();
        win.send(state(4));

        expect(states).toEqual([
            { seq: 1, shared: { seq: 1 }, private: { hand: [1, 2] } },
            { seq: 3, shared: { seq: 3 }, private: { hand: [2] } },
        ]);
        expect(client.state).toEqual({ seq: 4, shared: { seq: 4 }, private: undefined });
    });

    test("drops a state whose seq is below the last one's", async () => {
        const [client, win] = await connected("spectator");
        const seqs: number[] = [];
        client.onStateChange((s) => seqs.push(s.seq));

        win.send(state(5));
        // Out of order
        win.send(state(4));
        win.send(state(6));

        expect(seqs).toEqual([5, 6]);
        expect(client.state?.seq).toBe(6);
    });

    // As OpenChat sends the latest state again when the user's role changes
    test("is replaced by one with the same seq, eg. with the player's own part", async () => {
        const [client, win] = await connected();
        const states: MiniAppState[] = [];
        client.onStateChange((s) => states.push(s));

        win.send(state(5));
        win.send(state(5, { hand: [1] }));

        expect(states).toHaveLength(2);
        expect(client.state).toEqual({ seq: 5, shared: { seq: 5 }, private: { hand: [1] } });
    });

    test("ignores states from anything but OpenChat's window and origin, or which can't be read", async () => {
        const [client, win] = await connected();

        win.send(state(1), { source: {} });
        win.send(state(2), { origin: "https://evil.example" });
        win.send({ kind: "mini_app_state", seq: "3", shared: {} });

        expect(client.state).toBeUndefined();
    });
});

describe("MiniAppClient, initialised again as the user's role changes", () => {
    test("takes the user's new role, with the state re-sent before or after it", async () => {
        for (const stateFirst of [true, false]) {
            const [client, win] = await connected("spectator");
            const roles: MiniAppRole[] = [];
            client.onRoleChange((role) => roles.push(role));
            win.send(state(7));

            // They joined the game, so get their own part of the state
            if (stateFirst) win.send(state(7, { hand: [1] }));
            initialise(win, { role: "player" });
            if (!stateFirst) win.send(state(7, { hand: [1] }));

            expect(roles).toEqual(["player"]);
            expect(client.token).toBe(token(3600));
            expect(client.state).toEqual({ seq: 7, shared: { seq: 7 }, private: { hand: [1] } });
        }
    });

    test("clears the player's own part of the state when they become a spectator", async () => {
        const [client, win] = await connected();
        win.send(state(7, { hand: [1] }));
        const states: MiniAppState[] = [];
        client.onStateChange((s) => states.push(s));

        initialise(win, { role: "spectator" });

        expect(client.state).toEqual({ seq: 7, shared: { seq: 7 }, private: undefined });
        expect(states).toEqual([client.state]);
        // And takes the same state again, as OpenChat re-sends it
        win.send(state(7));
        expect(states).toHaveLength(2);
    });

    test("drops a player's token when they become a spectator", async () => {
        const [client, win] = await connected();
        const refreshed = client.refreshToken();

        initialise(win, { role: "spectator" });

        await expect(refreshed).rejects.toThrow("Only a player has a token");
        expect(client.role).toBe("spectator");
        expect(client.token).toBeUndefined();
        vi.advanceTimersByTime(3600_000);
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(1);
    });
});

describe("MiniAppClient's token", () => {
    test("is asked of OpenChat, at its origin only, and resolves with the new one", async () => {
        const [client, win] = await connected();

        const refreshed = client.refreshToken();
        // Requests made while one is waiting share it
        const again = client.refreshToken();

        expect(win.posted.at(-1)).toEqual({
            message: { kind: "mini_app_token_request" },
            targetOrigin: OPENCHAT,
        });
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(1);
        win.send({ kind: "mini_app_token", token: "new" });

        expect(await refreshed).toBe("new");
        expect(await again).toBe("new");
        expect(client.token).toBe("new");
    });

    test("is only taken from OpenChat's origin and window", async () => {
        const [client, win] = await connected();

        win.send(
            { kind: "mini_app_token", token: "other origin" },
            { origin: "https://x.example" },
        );
        win.send({ kind: "mini_app_token", token: "other window" }, { source: {} });
        win.send({ kind: "mini_app_token", token: 42 });

        expect(client.token).toBe(token(3600));
    });

    test("request is rejected if OpenChat doesn't answer, and made again next time", async () => {
        const [client, win] = await connected("player", { timeoutMs: 1000 });

        const refreshed = client.refreshToken();
        const rejected = expect(refreshed).rejects.toThrow("OpenChat didn't send a new token");
        vi.advanceTimersByTime(1000);
        await rejected;

        client.refreshToken();
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(2);
    });

    test("is asked for a minute before it expires", async () => {
        const [client, win] = await connected();

        vi.advanceTimersByTime(3_539_000);
        expect(win.kinds()).not.toContain("mini_app_token_request");
        vi.advanceTimersByTime(1_000);
        expect(win.kinds()).toContain("mini_app_token_request");

        // And again before the new one does
        win.send({ kind: "mini_app_token", token: token(3540 + 3600) });
        expect(client.token).toBe(token(7140));
        vi.advanceTimersByTime(3_540_000);
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(2);
    });

    test("is asked for again later if OpenChat doesn't answer", async () => {
        const [client, win] = await connected("player", { timeoutMs: 1000 });
        const requests = () => win.kinds().filter((k) => k === "mini_app_token_request").length;

        vi.advanceTimersByTime(3_540_000);
        expect(requests()).toBe(1);
        // No answer within the timeout, then 30 seconds before the next try
        vi.advanceTimersByTime(1000);
        await vi.waitFor(() => expect(requests()).toBe(1));
        vi.advanceTimersByTime(29_999);
        expect(requests()).toBe(1);
        vi.advanceTimersByTime(1);
        expect(requests()).toBe(2);

        win.send({ kind: "mini_app_token", token: token(7200) });
        expect(client.token).toBe(token(7200));
        vi.advanceTimersByTime(60_000);
        expect(requests()).toBe(2);
    });

    test("isn't asked for again and again when it looks expired already", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });
        initialise(win, { seconds: -60 });
        await connecting;

        vi.advanceTimersByTime(29_000);
        expect(win.kinds()).not.toContain("mini_app_token_request");
        vi.advanceTimersByTime(1_000);
        expect(win.kinds()).toContain("mini_app_token_request");
    });
});

describe("MiniAppClient.start", () => {
    test("asks OpenChat, at its origin, and resolves with its answer", async () => {
        const [client, win] = await connected();

        const started = client.start();
        expect(win.posted.at(-1)).toEqual({
            message: { kind: "mini_app_start" },
            targetOrigin: OPENCHAT,
        });
        // Not from anywhere else, nor without an answer
        win.send(
            { kind: "mini_app_start_result", accepted: true },
            { origin: "https://x.example" },
        );
        win.send({ kind: "mini_app_start_result", message: "?" });
        win.send({ kind: "mini_app_start_result", accepted: false, message: "Needs 2 players" });

        expect(await started).toEqual({ accepted: false, message: "Needs 2 players" });

        const again = client.start();
        win.send({ kind: "mini_app_start_result", accepted: true, message: null });
        expect(await again).toEqual({ accepted: true, message: undefined });
    });

    test("shares a start that's waiting", async () => {
        const [client, win] = await connected();

        const first = client.start();
        const second = client.start();
        win.send({ kind: "mini_app_start_result", accepted: true });

        expect(second).toBe(first);
        expect(win.kinds().filter((k) => k === "mini_app_start")).toHaveLength(1);
        expect(await first).toEqual({ accepted: true, message: undefined });
    });

    test("is refused if OpenChat doesn't answer in time, and asked again next time", async () => {
        const [client, win] = await connected("player", { timeoutMs: 1000 });

        const started = client.start();
        vi.advanceTimersByTime(1000);

        expect(await started).toEqual({ accepted: false, message: "OpenChat didn't answer" });
        // A late answer is ignored
        win.send({ kind: "mini_app_start_result", accepted: true });
        client.start();
        expect(win.kinds().filter((k) => k === "mini_app_start")).toHaveLength(2);
    });

    test("is only a player's", async () => {
        const [client, win] = await connected("spectator");

        await expect(client.start()).rejects.toThrow("Only a player can start the game");
        expect(win.kinds()).not.toContain("mini_app_start");
    });

    test("is rejected when the client closes", async () => {
        const [client] = await connected();
        const started = client.start();

        client.close();

        await expect(started).rejects.toThrow("closed");
        await expect(client.start()).rejects.toThrow("closed");
    });
});

describe("MiniAppClient", () => {
    test("follows the user's theme", async () => {
        const [client, win] = await connected();
        const changes: boolean[] = [];
        const stop = client.onDarkModeChange((dark) => changes.push(dark));

        win.send({ kind: "set_dark_mode", dark_mode: false });
        // Unchanged
        win.send({ kind: "set_dark_mode", dark_mode: false });
        win.send({ kind: "set_dark_mode", dark_mode: true }, { origin: "https://x.example" });
        win.send({ kind: "set_dark_mode", dark_mode: true });
        stop();
        win.send({ kind: "set_dark_mode", dark_mode: false });

        expect(changes).toEqual([false, true]);
        expect(client.darkMode).toBe(false);
    });

    test("fetch sends a player's token, and on a 401 asks for a new one and tries once more", async () => {
        const sent: { url: string; token: string | null; body: unknown }[] = [];
        const statuses = [401, 200];
        const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            sent.push({
                url: String(input),
                token: new Headers(init?.headers).get("x-oc-jwt"),
                body: init?.body,
            });
            return new Response("{}", { status: statuses.shift() });
        });
        const [client, win] = await connected("player", { fetch });

        const response = client.fetch("api/move", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        await vi.waitFor(() => expect(win.kinds()).toContain("mini_app_token_request"));
        win.send({ kind: "mini_app_token", token: "new" });

        expect((await response).status).toBe(200);
        expect(sent).toEqual([
            { url: "api/move", token: token(3600), body: "{}" },
            { url: "api/move", token: "new", body: "{}" },
        ]);
    });

    test("fetch tries only once more", async () => {
        const fetch = vi.fn(async () => new Response("", { status: 401 }));
        const [client, win] = await connected("player", { fetch });

        const response = client.fetch("api/move");
        await vi.waitFor(() => expect(win.kinds()).toContain("mini_app_token_request"));
        win.send({ kind: "mini_app_token", token: "new" });

        expect((await response).status).toBe(401);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test("fetch sends the token only to the app's own origin", async () => {
        const sent: { url: string; token: string | null }[] = [];
        const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            sent.push({ url: String(input), token: new Headers(init?.headers).get("x-oc-jwt") });
            return new Response("", { status: 401 });
        });
        const [client, win] = await connected("player", { fetch });

        await client.fetch("https://avatars.example.com/alice.png");
        await client.fetch(new URL("https://uno.example.com.evil.example/api"));
        await client.fetch("//avatars.example.com/bob.png");
        // Nor is a new token asked for when somewhere else answers with a 401
        expect(win.kinds()).not.toContain("mini_app_token_request");

        const toBot = client.fetch("https://uno.example.com/api/board");
        await vi.waitFor(() => expect(win.kinds()).toContain("mini_app_token_request"));
        win.send({ kind: "mini_app_token", token: "new" });
        await toBot;

        expect(sent.map((s) => s.token)).toEqual([null, null, null, token(3600), "new"]);
    });

    test("fetch sends a spectator's requests without a token", async () => {
        const headers: Headers[] = [];
        const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            headers.push(new Headers(init?.headers));
            return new Response("", { status: 401 });
        });
        const [client, win] = await connected("spectator", { fetch });

        const response = await client.fetch("api/board");

        expect(response.status).toBe(401);
        expect(headers).toHaveLength(1);
        expect(headers[0].has("x-oc-jwt")).toBe(false);
        expect(win.kinds()).not.toContain("mini_app_token_request");
    });

    test("close stops listening and rejects a waiting token request", async () => {
        const [client, win] = await connected();
        const refreshed = client.refreshToken();

        client.close();

        await expect(refreshed).rejects.toThrow("closed");
        expect(win.listening).toBe(0);
        await expect(client.refreshToken()).rejects.toThrow("closed");
    });
});

describe("tokenExpiry", () => {
    test("reads the token's exp claim, in ms", () => {
        expect(tokenExpiry(token(900))).toBe(NOW + 900_000);
        expect(tokenExpiry("not a token")).toBeUndefined();
        expect(tokenExpiry("a.b.c")).toBeUndefined();
    });
});
