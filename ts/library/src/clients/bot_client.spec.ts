import type { HttpAgent } from "@dfinity/agent";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BotClientConfig } from "../domain";
import { ActionContext } from "../domain/action_context";
import { ChatActionScope } from "../domain/scope";
import { GroupChatIdentifier } from "../domain/identifiers";
import { TextMessage } from "../domain/message";
import type { LocalUserIndexBotSendMessageArgs } from "../typebox/typebox";
import { clearOgPreviewCache } from "../utils/linkPreviews";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import { BotClient } from "./bot_client";

const PROXY = "https://preview.test";

const config: BotClientConfig = {
    openStorageCanisterId: "aaaaa-aa",
    icHost: "https://icp-api.io",
    identityPrivateKey: "not-used",
    openchatPublicKey: "not-used",
    previewProxyUrl: PROXY,
};

// The bot gateway canister id has to be a valid principal because the msgpack agent parses it,
// but we never actually reach the network because executeMsgpackUpdate is stubbed.
const actionContext = new ActionContext(
    "aaaaa-aa",
    new ChatActionScope(new GroupChatIdentifier("aaaaa-aa")),
);

function createClient(overrides: Partial<BotClientConfig> = {}) {
    return new BotClient({} as HttpAgent, { ...config, ...overrides }, actionContext);
}

// Stub out the actual canister call and capture the args that would have been sent.
function stubSend() {
    const sent: LocalUserIndexBotSendMessageArgs[] = [];
    vi.spyOn(
        MsgpackCanisterAgent.prototype as unknown as {
            executeMsgpackUpdate: (...args: unknown[]) => Promise<unknown>;
        },
        "executeMsgpackUpdate",
    ).mockImplementation((_method: unknown, args: unknown) => {
        sent.push(args as LocalUserIndexBotSendMessageArgs);
        return Promise.resolve({ kind: "success" });
    });
    return sent;
}

function mockPreviewService(impl: () => unknown) {
    const spy = vi.fn(() => Promise.resolve(impl()));
    vi.stubGlobal("fetch", spy);
    return spy;
}

beforeEach(() => {
    clearOgPreviewCache();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("BotClient.sendMessage og_previews", () => {
    test("auto fetches previews for links in the message text", async () => {
        const sent = stubSend();
        mockPreviewService(() => ({
            ok: true,
            json: () => Promise.resolve({ title: "A title", description: "A description" }),
        }));

        const resp = await createClient().sendMessage(
            new TextMessage("look at [this](https://example.com/a)"),
        );

        expect(resp.kind).toBe("success");
        expect(sent[0].og_previews).toEqual([
            { url: "https://example.com/a", title: "A title", description: "A description" },
        ]);
    });

    test("makes no http call and sends no previews when the text has no links", async () => {
        const sent = stubSend();
        const spy = mockPreviewService(() => ({ ok: true, json: () => Promise.resolve({}) }));

        await createClient().sendMessage(new TextMessage("no links in here"));

        expect(spy).not.toHaveBeenCalled();
        expect(sent[0].og_previews).toBeUndefined();
    });

    test("does not fetch when autoFetchOgPreviews is false", async () => {
        const sent = stubSend();
        const spy = mockPreviewService(() => ({ ok: true, json: () => Promise.resolve({}) }));

        await createClient({ autoFetchOgPreviews: false }).sendMessage(
            new TextMessage("look at https://example.com/a"),
        );

        expect(spy).not.toHaveBeenCalled();
        expect(sent[0].og_previews).toBeUndefined();
    });

    test("explicitly set previews are sent verbatim and suppress the fetch", async () => {
        const sent = stubSend();
        const spy = mockPreviewService(() => ({ ok: true, json: () => Promise.resolve({}) }));

        const message = new TextMessage("look at https://example.com/a").setOgPreviews<TextMessage>(
            [{ url: "https://example.com/a", title: "mine", description: "" }],
        );
        await createClient().sendMessage(message);

        expect(spy).not.toHaveBeenCalled();
        expect(sent[0].og_previews).toEqual([
            { url: "https://example.com/a", title: "mine", description: "" },
        ]);
    });

    test("an explicitly empty list suppresses previews without fetching", async () => {
        const sent = stubSend();
        const spy = mockPreviewService(() => ({ ok: true, json: () => Promise.resolve({}) }));

        const message = new TextMessage(
            "look at https://example.com/a",
        ).setOgPreviews<TextMessage>([]);
        await createClient().sendMessage(message);

        expect(spy).not.toHaveBeenCalled();
        expect(sent[0].og_previews).toEqual([]);
    });

    test("ephemeral messages are rejected before any preview lookup happens", async () => {
        stubSend();
        const spy = mockPreviewService(() => ({ ok: true, json: () => Promise.resolve({}) }));
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const message = new TextMessage(
            "look at https://example.com/a",
        ).makeEphemeral<TextMessage>();
        const resp = await createClient().sendMessage(message);

        expect(resp.kind).toBe("error");
        expect(spy).not.toHaveBeenCalled();
    });

    describe("preview failures never stop the message being sent", () => {
        test("when the preview service rejects", async () => {
            const sent = stubSend();
            vi.stubGlobal(
                "fetch",
                vi.fn(() => Promise.reject(new Error("network is down"))),
            );

            const resp = await createClient().sendMessage(
                new TextMessage("look at https://example.com/a"),
            );

            expect(resp.kind).toBe("success");
            expect(sent[0].og_previews).toBeUndefined();
        });

        test("when the preview service throws synchronously", async () => {
            const sent = stubSend();
            vi.stubGlobal(
                "fetch",
                vi.fn(() => {
                    throw new Error("boom");
                }),
            );

            const resp = await createClient().sendMessage(
                new TextMessage("look at https://example.com/a"),
            );

            expect(resp.kind).toBe("success");
            expect(sent[0].og_previews).toBeUndefined();
        });

        test("when the preview service is rate limiting us", async () => {
            const sent = stubSend();
            mockPreviewService(() => ({
                ok: false,
                status: 429,
                json: () => Promise.resolve({}),
            }));

            const resp = await createClient().sendMessage(
                new TextMessage("look at https://example.com/a"),
            );

            expect(resp.kind).toBe("success");
            expect(sent[0].og_previews).toBeUndefined();
        });

        test("when the preview service hangs and the request times out", async () => {
            const sent = stubSend();
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    (_input: RequestInfo | URL, init?: RequestInit) =>
                        new Promise((_resolve, reject) => {
                            init?.signal?.addEventListener("abort", () =>
                                reject(new Error("aborted")),
                            );
                        }),
                ),
            );
            vi.useFakeTimers();

            const promise = createClient().sendMessage(
                new TextMessage("look at https://example.com/a"),
            );
            await vi.advanceTimersByTimeAsync(6000);
            const resp = await promise;

            expect(resp.kind).toBe("success");
            expect(sent[0].og_previews).toBeUndefined();
        });
    });
});
