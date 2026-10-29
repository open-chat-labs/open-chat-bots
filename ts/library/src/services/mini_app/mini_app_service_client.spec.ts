import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ChannelIdentifier, GroupChatIdentifier } from "../../domain/identifiers";
import { COMMUNITY, GAME_JSON, GROUP, NOW, USER, sign } from "../../utils/test_tokens";
import { MiniAppServiceClient, MiniAppServiceError } from "./mini_app_service_client";

const URL = "https://mini-apps.example.com";
const ALICE = USER;
const BOB = "qhbym-qaaaa-aaaaa-aaafq-cai";

const GAME = {
    chat: new ChannelIdentifier(COMMUNITY, 7n),
    thread: 3,
    messageId: 18446744073709551615n,
};

// A bot token as the LocalUserIndex writes one, expiring an hour after `issuedAt`. Only its claims
// are read, to know when it expires.
function botToken(issuedAt: number): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claims = { exp: issuedAt / 1000 + 3600, claim_type: "MiniAppBot", bot: `bot${issuedAt}` };
    return `${encode({ alg: "ES256" })}.${encode(claims)}.sig`;
}

type Sent = { url: string; method?: string; authorization: string | null; body?: string };

// The service, answering each call with the next of `statuses`, and 200 once they run out
function service(...statuses: (number | [number, string])[]) {
    const sent: Sent[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        sent.push({
            url: String(input),
            method: init?.method,
            authorization: new Headers(init?.headers).get("authorization"),
            body: init?.body as string | undefined,
        });
        const next = statuses.shift() ?? 200;
        const [status, body] = typeof next === "number" ? [next, "{}"] : next;
        return new Response(body, { status });
    });
    return { fetch, sent };
}

function client(
    fetch: typeof globalThis.fetch,
    getBotToken = vi.fn(async () => botToken(Date.now())),
) {
    return { client: new MiniAppServiceClient(`${URL}/`, getBotToken, { fetch }), getBotToken };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("MiniAppServiceClient.update", () => {
    test("sends the update as the service reads it, leaving out what it doesn't set", async () => {
        const { fetch, sent } = service();
        const { client: miniApps } = client(fetch);

        await miniApps.update({
            game: GAME,
            waitingFor: [ALICE],
            remove: [BOB],
            state: { seq: 12, shared: { turn: 0 }, private: { [ALICE]: { hand: [1, 2] } } },
        });
        // Ending it, the only status a bot sets, as a player starts it through the service
        await miniApps.update({ game: GAME, status: "finished", result: "Alice won" });
        await miniApps.update({
            game: { chat: new GroupChatIdentifier(GROUP), messageId: 5n },
            waitingFor: [],
            state: { seq: 13, shared: null },
        });

        expect(sent.map((s) => [s.method, s.url])).toEqual([
            ["POST", `${URL}/bot/update`],
            ["POST", `${URL}/bot/update`],
            ["POST", `${URL}/bot/update`],
        ]);
        expect(sent[0].body).toBe(
            `{"game":${GAME_JSON},"waiting_for":["${ALICE}"],"remove":["${BOB}"],"state":{"seq":12,"shared":{"turn":0},"private":{"${ALICE}":{"hand":[1,2]}}}}`,
        );
        expect(sent[1].body).toBe(`{"game":${GAME_JSON},"status":"Finished","result":"Alice won"}`);
        // An empty waiting_for is sent, as it's no one in particular
        expect(sent[2].body).toBe(
            `{"game":{"chat":{"Group":"${GROUP}"},"thread":null,"message_id":"5"},"waiting_for":[],"state":{"seq":13,"shared":null}}`,
        );
    });

    test("maps the service's errors", async () => {
        const errors: [number, string, string][] = [
            [400, "invalid", "A game's status only moves forward"],
            // axum's answers to a body that isn't JSON, or doesn't fit
            [415, "invalid", "Expected request with `Content-Type: application/json`"],
            [422, "invalid", "Failed to deserialize the JSON body into the target type"],
            [403, "not_bots_game", "Another bot's game"],
            [404, "unknown_game", "Unknown game"],
            [409, "finished", "The game has finished"],
            [413, "too_large", "Failed to buffer the request body"],
            [503, "unavailable", "Unavailable"],
        ];
        for (const [status, kind, message] of errors) {
            const body = [413, 415, 422].includes(status)
                ? message
                : JSON.stringify({ error: message });
            const { fetch } = service([status, body]);

            const error = await client(fetch)
                .client.update({ game: GAME })
                .catch((err) => err);

            expect(error).toBeInstanceOf(MiniAppServiceError);
            expect(error).toMatchObject({ kind, status, message });
        }

        // And when the service can't be reached, as every error is a MiniAppServiceError
        const unreachable = vi.fn(async () => {
            throw new TypeError("fetch failed");
        });
        const { client: miniApps } = client(unreachable);
        for (const call of [() => miniApps.update({ game: GAME }), () => miniApps.publicKey()]) {
            const error = await call().catch((err) => err);

            expect(error).toBeInstanceOf(MiniAppServiceError);
            expect(error).toMatchObject({ kind: "unavailable", status: 0 });
            expect(error.message).toContain("fetch failed");
        }
    });
});

describe("MiniAppServiceClient.register", () => {
    test("registers the game, and resolves with it, as the registration names it", async () => {
        const { fetch, sent } = service();
        const registration = sign(
            `{"exp":${NOW / 1000 + 3600},"claim_type":"MiniAppRegistration","bot":"b","bot_endpoint":"https://uno.example.com","bot_api_gateway":"g","game":${GAME_JSON},"max_players":4,"spectators":true}`,
        );

        const game = await client(fetch).client.register(registration);

        expect(game).toEqual(GAME);
        expect(sent).toEqual([
            {
                url: `${URL}/bot/register`,
                method: "POST",
                authorization: `Bearer ${botToken(NOW)}`,
                body: JSON.stringify({ registration }),
            },
        ]);
    });

    test("refuses what isn't a registration, without calling the service", async () => {
        const { fetch } = service();

        await expect(client(fetch).client.register("not a token")).rejects.toThrow(
            "Not a MiniApp registration",
        );
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("MiniAppServiceClient's bot token", () => {
    test("is kept, and fetched again five minutes before it expires", async () => {
        const { fetch, sent } = service();
        const { client: miniApps, getBotToken } = client(fetch);

        await miniApps.update({ game: GAME });
        vi.advanceTimersByTime(55 * 60 * 1000 - 1);
        await miniApps.update({ game: GAME });
        expect(getBotToken).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        await miniApps.update({ game: GAME });

        expect(getBotToken).toHaveBeenCalledTimes(2);
        expect(sent.map((s) => s.authorization)).toEqual([
            `Bearer ${botToken(NOW)}`,
            `Bearer ${botToken(NOW)}`,
            `Bearer ${botToken(NOW + 55 * 60 * 1000)}`,
        ]);
    });

    test("is fetched once for calls made together", async () => {
        const { fetch } = service();
        const { client: miniApps, getBotToken } = client(fetch);

        await Promise.all([miniApps.update({ game: GAME }), miniApps.update({ game: GAME })]);

        expect(getBotToken).toHaveBeenCalledTimes(1);
    });

    test("is fetched again when the service refuses it, and the call retried once", async () => {
        const { fetch, sent } = service(401);
        const tokens = ["first", "second"];
        const { client: miniApps, getBotToken } = client(
            fetch,
            vi.fn(async () => tokens.shift()!),
        );

        await miniApps.update({ game: GAME, status: "finished" });

        expect(getBotToken).toHaveBeenCalledTimes(2);
        expect(sent.map((s) => s.authorization)).toEqual(["Bearer first", "Bearer second"]);
        expect(sent[1].body).toBe(sent[0].body);
    });

    test("is retried only once", async () => {
        const { fetch } = service(
            [401, '{"error":"Invalid bot token"}'],
            [401, '{"error":"Invalid bot token"}'],
        );
        const { client: miniApps } = client(fetch);

        await expect(miniApps.update({ game: GAME })).rejects.toMatchObject({
            kind: "unauthorized",
            status: 401,
            message: "Invalid bot token",
        });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test("is fetched again after a failure", async () => {
        const { fetch } = service();
        const getBotToken = vi
            .fn(async () => botToken(Date.now()))
            .mockRejectedValueOnce(new Error("NotAuthorized"));
        const { client: miniApps } = client(fetch, getBotToken);

        await expect(miniApps.update({ game: GAME })).rejects.toThrow("NotAuthorized");
        await miniApps.update({ game: GAME });

        expect(getBotToken).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe("MiniAppServiceClient.publicKey", () => {
    test("is fetched when first asked for and kept, or fetched again after a failure", async () => {
        const pem = "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----\n";
        const { fetch, sent } = service([503, '{"error":"Unavailable"}'], [200, pem]);
        const { client: miniApps, getBotToken } = client(fetch);

        await expect(miniApps.publicKey()).rejects.toMatchObject({ kind: "unavailable" });
        expect(await miniApps.publicKey()).toBe(pem);
        expect(await miniApps.publicKey()).toBe(pem);

        expect(sent.map((s) => [s.method, s.url, s.authorization])).toEqual([
            [undefined, `${URL}/public_key`, null],
            [undefined, `${URL}/public_key`, null],
        ]);
        expect(getBotToken).not.toHaveBeenCalled();
    });
});
