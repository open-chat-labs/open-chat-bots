import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    MiniAppClient,
    connectToOpenChat,
    tokenExpiry,
    type MiniAppMessageEvent,
    type MiniAppToOpenChat,
    type MiniAppWindow,
} from "./index";

const OPENCHAT = "https://oc.app";
const NOW = 1_800_000_000_000;

// A token as OpenChat signs one, expiring in `seconds`. Only its claims are read in the browser.
function token(seconds: number, user = "user"): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "ES256" })}.${encode({ exp: NOW / 1000 + seconds, user_id: user })}.sig`;
}

// The page's window, framed by OpenChat's
class FakeWindow implements MiniAppWindow {
    readonly posted: { message: MiniAppToOpenChat; targetOrigin: string }[] = [];
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

function initialise(win: FakeWindow, seconds = 900, from: { origin?: string } = {}) {
    win.send(
        { kind: "initialise_mini_app", token: token(seconds), dark_mode: true, locale: "fr" },
        from,
    );
}

async function connected(win = new FakeWindow()): Promise<[MiniAppClient, FakeWindow]> {
    const connecting = connectToOpenChat({ window: win });
    initialise(win);
    return [await connecting, win];
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("connectToOpenChat", () => {
    test("says the app is ready, to any origin, then takes OpenChat's token, theme and language", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });

        expect(win.posted).toEqual([{ message: { kind: "mini_app_ready" }, targetOrigin: "*" }]);
        initialise(win);
        const client = await connecting;

        expect(client.token()).toBe(token(900));
        expect(client.darkMode).toBe(true);
        expect(client.locale).toBe("fr");
        expect(client.openChatOrigin).toBe(OPENCHAT);
    });

    test("ignores messages from anything but the window it's framed in", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, timeoutMs: 1000 });

        win.send(
            { kind: "initialise_mini_app", token: "forged", dark_mode: false, locale: "en" },
            { source: {}, origin: "https://evil.example" },
        );
        win.send({ kind: "mini_app_token", token: "early" });
        win.send({ kind: "initialise_mini_app" });
        win.send("initialise_mini_app");
        initialise(win);

        expect((await connecting).token()).toBe(token(900));
    });

    test("accepts only the origins it's given, if any", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, openChatOrigins: [OPENCHAT] });

        initialise(win, 900, { origin: "https://other.example" });
        win.send({ kind: "initialise_mini_app", token: "right", dark_mode: false, locale: "en" });

        expect((await connecting).token()).toBe("right");
    });

    test("fills in a missing theme or language", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });
        win.send({ kind: "initialise_mini_app", token: "t" });
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

describe("MiniAppClient", () => {
    test("asks OpenChat, at its origin only, for a new token, and resolves with it", async () => {
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
        expect(client.token()).toBe("new");
    });

    test("only takes tokens from OpenChat's origin and window", async () => {
        const [client, win] = await connected();

        win.send(
            { kind: "mini_app_token", token: "other origin" },
            { origin: "https://x.example" },
        );
        win.send({ kind: "mini_app_token", token: "other window" }, { source: {} });
        win.send({ kind: "mini_app_token", token: 42 });

        expect(client.token()).toBe(token(900));
    });

    test("rejects a token request OpenChat doesn't answer, and asks again next time", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, timeoutMs: 1000 });
        initialise(win);
        const client = await connecting;

        const refreshed = client.refreshToken();
        const rejected = expect(refreshed).rejects.toThrow("OpenChat didn't send a new token");
        vi.advanceTimersByTime(1000);
        await rejected;

        client.refreshToken();
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(2);
    });

    test("asks for a new token a minute before the current one expires", async () => {
        const [client, win] = await connected();

        vi.advanceTimersByTime(839_000);
        expect(win.kinds()).not.toContain("mini_app_token_request");
        vi.advanceTimersByTime(1_000);
        expect(win.kinds()).toContain("mini_app_token_request");

        // And again before the new one does
        win.send({ kind: "mini_app_token", token: token(900 + 840) });
        expect(client.token()).toBe(token(1740));
        vi.advanceTimersByTime(840_000);
        expect(win.kinds().filter((k) => k === "mini_app_token_request")).toHaveLength(2);
    });

    test("doesn't ask again and again for a token which looks expired already", async () => {
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win });
        initialise(win, -60);
        await connecting;

        vi.advanceTimersByTime(29_000);
        expect(win.kinds()).not.toContain("mini_app_token_request");
        vi.advanceTimersByTime(1_000);
        expect(win.kinds()).toContain("mini_app_token_request");
    });

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

    test("takes OpenChat initialising it again", async () => {
        const [client, win] = await connected();

        win.send({ kind: "initialise_mini_app", token: "again", dark_mode: false, locale: "de" });

        expect([client.token(), client.darkMode, client.locale]).toEqual(["again", false, "de"]);
    });

    test("fetch sends the token, and on a 401 asks for a new one and tries once more", async () => {
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
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, fetch });
        initialise(win);
        const client = await connecting;

        const response = client.fetch("api/press", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        await vi.waitFor(() => expect(win.kinds()).toContain("mini_app_token_request"));
        win.send({ kind: "mini_app_token", token: "new" });

        expect((await response).status).toBe(200);
        expect(sent).toEqual([
            { url: "api/press", token: token(900), body: "{}" },
            { url: "api/press", token: "new", body: "{}" },
        ]);
    });

    test("fetch tries only once more", async () => {
        const fetch = vi.fn(async () => new Response("", { status: 401 }));
        const win = new FakeWindow();
        const connecting = connectToOpenChat({ window: win, fetch });
        initialise(win);
        const client = await connecting;

        const response = client.fetch("api/presses");
        await vi.waitFor(() => expect(win.kinds()).toContain("mini_app_token_request"));
        win.send({ kind: "mini_app_token", token: "new" });

        expect((await response).status).toBe(401);
        expect(fetch).toHaveBeenCalledTimes(2);
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
