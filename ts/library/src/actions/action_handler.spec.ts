import { Principal } from "@dfinity/principal";
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BotClientFactory } from "../clients/client_factory";
import { GlobalClient } from "../clients/global_client";
import { TextMessage } from "../domain/message";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import type { LocalUserIndexBotEditMessageArgs } from "../typebox/typebox";
import {
    API_GATEWAY,
    BOT_ID,
    COMMUNITY,
    GROUP,
    NOW,
    OTHER_BOT,
    USER,
    publicKeyPem,
    sessionToken,
} from "../utils/test_tokens";
import {
    ActionHandlerRegistry,
    ButtonPress,
    type ActionHandler,
    type ActionResponseWriter,
} from "./action_handler";
import { ActionResponse, actionHttpResponse } from "./action_response";

function secp256k1Pem(): string {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
    return privateKey.export({ type: "sec1", format: "pem" }).toString();
}

function factory(): BotClientFactory {
    return new BotClientFactory({
        openchatPublicKey: publicKeyPem(),
        // Mainnet, so the agent doesn't fetch a root key
        icHost: "https://icp-api.io",
        identityPrivateKey: secp256k1Pem(),
        openStorageCanisterId: "aaaaa-aa",
        autoFetchOgPreviews: false,
    });
}

// Records the presses it's given, and answers each with a reply naming the button
function recorder(prefix = ""): ActionHandler & { presses: ButtonPress[] } {
    const presses: ButtonPress[] = [];
    return {
        presses,
        handles: (buttonId) => buttonId.startsWith(prefix),
        execute: async (press) => {
            presses.push(press);
            return ActionResponse.reply(`${press.buttonId} pressed`);
        },
    };
}

// Stubs out the canister calls, capturing the method, the canister called and the args
function stubUpdates() {
    const calls: { canisterId: string; method: string; args: unknown }[] = [];
    vi.spyOn(
        MsgpackCanisterAgent.prototype as unknown as {
            executeMsgpackUpdate: (...args: unknown[]) => Promise<unknown>;
        },
        "executeMsgpackUpdate",
    ).mockImplementation(function (this: { canisterId: string }, method: unknown, args: unknown) {
        calls.push({ canisterId: this.canisterId, method: method as string, args });
        return Promise.resolve({ kind: "success" });
    });
    return calls;
}

const join = JSON.stringify({ button_id: "join" });

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ActionHandlerRegistry", () => {
    test("gives a press to the first handler of its button", async () => {
        const game = recorder("cell-");
        const fallback = recorder();
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID })
            .register(game)
            .register(fallback);

        const response = await registry.execute(sessionToken(), '{"button_id":"cell-4"}', NOW);
        await registry.execute(sessionToken(), join, NOW);

        expect(response).toEqual(ActionResponse.reply("cell-4 pressed"));
        expect(game.presses.map((p) => p.buttonId)).toEqual(["cell-4"]);
        expect(fallback.presses.map((p) => p.buttonId)).toEqual(["join"]);
        const [press] = game.presses;
        expect(press.userId).toBe(USER);
        expect(press.session.messageId).toBe(18446744073709551615n);
        // An autonomous client for the message's chat
        expect(press.client.chatId).toEqual(press.session.chat);
        expect(press.client.command).toBeUndefined();
    });

    test("takes a function for every button", async () => {
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            async (press) => ActionResponse.reply(`${press.userId} pressed ${press.buttonId}`),
        );

        expect(await registry.execute(sessionToken(), join, NOW)).toEqual(
            ActionResponse.reply(`${USER} pressed join`),
        );
    });

    test("takes the body as text, bytes or parsed JSON", async () => {
        const handler = recorder();
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(handler);

        for (const body of [join, Buffer.from(join), { button_id: "join" }]) {
            const response = await registry.execute(sessionToken(), body, NOW);
            expect(actionHttpResponse(response).status).toBe(200);
        }
        expect(handler.presses).toHaveLength(3);
    });

    test("answers a bad token with a 401, before reading the body", async () => {
        const handler = recorder();
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(handler);
        const tokens = [
            undefined,
            "",
            "a.b.c",
            sessionToken({ expSeconds: NOW / 1000 }),
            sessionToken({ bot: OTHER_BOT }),
            sessionToken({ claimType: "BotActionByCommand" }),
        ];

        for (const token of tokens) {
            for (const body of [join, ""]) {
                const response = await registry.execute(token, body, NOW);
                expect(actionHttpResponse(response).status, `${token}`).toBe(401);
            }
        }
        expect(handler.presses).toHaveLength(0);
    });

    test("answers a bad body or button with a 400", async () => {
        const handler = recorder("cell-");
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(handler);
        const bodies = [
            "",
            "not json",
            "{}",
            "null",
            '"join"',
            '{"button":"cell-4"}',
            '{"button_id":4}',
            '{"button_id":""}',
            JSON.stringify({ button_id: `cell-${"1".repeat(60)}` }),
            // No handler handles it
            join,
        ];

        for (const body of bodies) {
            const response = await registry.execute(sessionToken(), body, NOW);
            expect(actionHttpResponse(response).status, body).toBe(400);
        }
        expect(handler.presses).toHaveLength(0);
    });

    test("answers a handler which throws with a 500", async () => {
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            async () => {
                throw new Error("Oops");
            },
        );

        const response = await registry.execute(sessionToken(), join, NOW);

        expect(response).toEqual(ActionResponse.internalError("Error: Oops"));
    });

    test("looks the bot's id up when the first press arrives, and keeps it", async () => {
        const lookup = vi
            .spyOn(GlobalClient.prototype, "botId")
            .mockRejectedValueOnce(new Error("BotNotFound"))
            .mockResolvedValue(BOT_ID);
        const registry = new ActionHandlerRegistry(factory()).register(recorder());

        expect(lookup).not.toHaveBeenCalled();
        // Not registered yet, so it's tried again on the next press
        const first = await registry.execute(sessionToken(), join, NOW);
        expect(actionHttpResponse(first).status).toBe(500);

        for (let i = 0; i < 3; i++) {
            const response = await registry.execute(sessionToken(), join, NOW);
            expect(actionHttpResponse(response).status).toBe(200);
        }
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    // The token's `bot` is the bot's user id, so a bot which checked tokens against its principal
    // would refuse every press
    test("checks tokens against the bot's user id, not its principal", async () => {
        const botFactory = factory();
        const principal = Principal.selfAuthenticating(new Uint8Array(44).fill(7)).toText();
        vi.spyOn(GlobalClient.prototype, "botId").mockResolvedValue(BOT_ID);

        const asUserId = new ActionHandlerRegistry(botFactory).register(recorder());
        const asPrincipal = new ActionHandlerRegistry(botFactory, { botId: principal }).register(
            recorder(),
        );

        expect(actionHttpResponse(await asUserId.execute(sessionToken(), join, NOW)).status).toBe(
            200,
        );
        expect(
            actionHttpResponse(await asPrincipal.execute(sessionToken(), join, NOW)).status,
        ).toBe(401);
    });
});

describe("ButtonPress.editMessage", () => {
    test("edits the pressed message autonomously, in its thread", async () => {
        const calls = stubUpdates();
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            async (press) => {
                const result = await press.editMessage({
                    text: "X to play",
                    buttonRows: [[{ id: "cell-4", label: "X", style: "secondary" }]],
                });
                return result.kind === "success"
                    ? ActionResponse.ok()
                    : ActionResponse.internalError(`${result.message}`);
            },
        );

        const response = await registry.execute(sessionToken(), '{"button_id":"cell-4"}', NOW);

        expect(response).toEqual(ActionResponse.ok());
        expect(calls).toHaveLength(1);
        const [{ canisterId, method, args }] = calls;
        const edit = args as LocalUserIndexBotEditMessageArgs;
        expect(canisterId).toBe(API_GATEWAY);
        expect(method).toBe("bot_edit_message");
        expect(edit.chat_context).toEqual({
            Autonomous: { Channel: [Principal.fromText(COMMUNITY).toUint8Array(), 7n] },
        });
        expect(edit.thread).toBe(3);
        expect(edit.message_id).toBe(18446744073709551615n);
        expect("MiniApp" in edit.content && edit.content.MiniApp).toEqual({
            text: "X to play",
            button_rows: [[{ id: "cell-4", label: "X", style: "Secondary" }]],
        });
    });

    test("edits a message outside a thread", async () => {
        const calls = stubUpdates();
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            async (press) => {
                await press.editMessage({ text: "Done", buttonRows: [] });
                return ActionResponse.ok();
            },
        );

        await registry.execute(
            sessionToken({ chat: `{"Group":"${GROUP}"}`, thread: null, messageId: "5" }),
            join,
            NOW,
        );

        const edit = calls[0].args as LocalUserIndexBotEditMessageArgs;
        expect(edit.chat_context).toEqual({
            Autonomous: { Group: Principal.fromText(GROUP).toUint8Array() },
        });
        expect(edit.thread).toBeUndefined();
        expect(edit.message_id).toBe(5n);
    });
});

describe("expressHandler", () => {
    function response() {
        const written: { status?: number; headers: Record<string, string>; body?: string } = {
            headers: {},
        };
        const res: ActionResponseWriter = {
            setHeader: (name, value) => (written.headers[name] = value),
            status: (code) => {
                written.status = code;
                return { send: (body) => (written.body = body) };
            },
        };
        return { res, written };
    }

    test("answers a press as the website expects", async () => {
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            async () => ActionResponse.reply("Not your turn"),
        );
        const { res, written } = response();

        await registry.expressHandler()(
            { headers: { "x-oc-jwt": sessionToken() }, body: { button_id: "join" } },
            res,
        );

        expect(written).toEqual({
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: '{"message":{"content":{"Text":{"text":"Not your turn"}},"block_level_markdown":false}}',
        });
    });

    test("answers a press without a token with a 401", async () => {
        const registry = new ActionHandlerRegistry(factory(), { botId: BOT_ID }).register(
            recorder(),
        );
        const { res, written } = response();

        await registry.expressHandler()({ headers: {}, body: { button_id: "join" } }, res);

        expect(written.status).toBe(401);
        expect(written.headers["Content-Type"]).toBe("text/plain");
    });
});

describe("actionHttpResponse", () => {
    test("gives each response the status and body the website expects", () => {
        expect(actionHttpResponse(ActionResponse.ok())).toEqual({
            status: 200,
            contentType: "application/json",
            body: "{}",
        });
        expect(actionHttpResponse(ActionResponse.replyWith(new TextMessage("**Hi**")))).toEqual({
            status: 200,
            contentType: "application/json",
            body: '{"message":{"content":{"Text":{"text":"**Hi**"}},"block_level_markdown":false}}',
        });
        expect(actionHttpResponse(ActionResponse.badRequest("No such button"))).toEqual({
            status: 400,
            contentType: "text/plain",
            body: "No such button",
        });
        expect(actionHttpResponse(ActionResponse.unauthorized("Token expired")).status).toBe(401);
        expect(actionHttpResponse(ActionResponse.tooManyRequests())).toEqual({
            status: 429,
            contentType: "text/plain",
            body: "",
        });
        expect(actionHttpResponse(ActionResponse.internalError("Oops"))).toEqual({
            status: 500,
            contentType: "text/plain",
            body: "Oops",
        });
    });
});
