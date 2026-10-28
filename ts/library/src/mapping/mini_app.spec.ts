import type { HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { Value } from "@sinclair/typebox/value";
import { Packr, type Options } from "msgpackr";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BotClient } from "../clients/bot_client";
import type { BotClientConfig } from "../domain";
import { ActionContext } from "../domain/action_context";
import { ChannelIdentifier, CommunityIdentifier, GroupChatIdentifier } from "../domain/identifiers";
import {
    MINI_APP_MAX_TEXT_CHARS,
    MiniAppMessage,
    TextMessage,
    validateMiniAppText,
} from "../domain/message";
import { Permissions } from "../domain/permissions";
import { ChatActionScope, CommunityActionScope } from "../domain/scope";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import {
    BotMessageContent as ApiBotMessageContent,
    MessageContent as ApiMessageContent,
    LocalUserIndexBotEditMessageArgs,
} from "../typebox/typebox";
import { messageContent } from "./index";

const Packer = new Packr({
    useRecords: false,
    skipValues: [undefined],
    largeBigIntToString: true,
} as unknown as Options);

const SENDER = "2yfsq-kaaaa-aaaaf-aaa4q-cai";
const GROUP = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const COMMUNITY = "r7inp-6aaaa-aaaaa-aaabq-cai";
const TEXT = "**Tic-tac-toe** · tap Open to play";

describe("MiniApp cards", () => {
    test("are read from a chat as OpenChat sends them", () => {
        const wire = Packer.pack({ MiniApp: { text: TEXT } });

        const api = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(messageContent(api, SENDER)).toEqual({ kind: "mini_app_content", text: TEXT });
    });

    test("are sent as OpenChat reads them", () => {
        const message = new MiniAppMessage(TEXT);
        const sent = Value.Parse(ApiBotMessageContent, message.toResponse().content);

        expect(Packer.unpack(Packer.pack(sent))).toEqual({ MiniApp: { text: TEXT } });
        expect(message.requiredMessagePermissions).toEqual(["MiniApp"]);
    });

    test("need message permission 11", () => {
        const encoded = Permissions.encodePermissions({
            community: [],
            chat: [],
            message: ["MiniApp"],
        });
        const permissions = new Permissions(encoded);

        expect(encoded.message).toBe(2048);
        expect(permissions.hasMessagePermission("MiniApp")).toBe(true);
        expect(permissions.hasMessagePermission("VideoCall")).toBe(false);
        expect(new Permissions({ message: 1 << 10 }).hasMessagePermission("MiniApp")).toBe(false);
    });
});

describe("validateMiniAppText", () => {
    test("passes 1 to 2,000 characters", () => {
        expect(validateMiniAppText("x")).toBeUndefined();
        // Counted in code points, as OpenChat counts them
        expect(validateMiniAppText("é".repeat(MINI_APP_MAX_TEXT_CHARS))).toBeUndefined();
        expect(validateMiniAppText("😀".repeat(MINI_APP_MAX_TEXT_CHARS))).toBeUndefined();
        expect(new MiniAppMessage(TEXT).validate()).toBeUndefined();
    });

    test("refuses blank or longer text, with OpenChat's error", () => {
        for (const text of ["", " \n", "x".repeat(MINI_APP_MAX_TEXT_CHARS + 1)]) {
            expect(validateMiniAppText(text)).toBe("The text must have 1 to 2000 characters");
        }
        expect(new MiniAppMessage(" ").validate()).toBeDefined();
    });
});

describe("BotClient.editMessage", () => {
    const config: BotClientConfig = {
        openStorageCanisterId: "aaaaa-aa",
        icHost: "https://icp-api.io",
        identityPrivateKey: "not-used",
        openchatPublicKey: "not-used",
        autoFetchOgPreviews: false,
    };

    function stubEdit() {
        const calls: { method: string; args: LocalUserIndexBotEditMessageArgs }[] = [];
        vi.spyOn(
            MsgpackCanisterAgent.prototype as unknown as {
                executeMsgpackUpdate: (...args: unknown[]) => Promise<unknown>;
            },
            "executeMsgpackUpdate",
        ).mockImplementation((method: unknown, args: unknown) => {
            calls.push({
                method: method as string,
                args: args as LocalUserIndexBotEditMessageArgs,
            });
            return Promise.resolve({ kind: "success" });
        });
        return calls;
    }

    function client(context: ActionContext) {
        return new BotClient({} as HttpAgent, config, context);
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("edits the bot's message autonomously, in its thread", async () => {
        const calls = stubEdit();
        const channel = new ChannelIdentifier(COMMUNITY, 7n);
        const autonomous = ActionContext.inAutonomousContext(
            new ChatActionScope(channel),
            "aaaaa-aa",
        );

        const message = new TextMessage("edited").setThread<TextMessage>(12);
        const response = await client(autonomous).editMessage(18446744073709551615n, message);

        expect(response).toEqual({ kind: "success" });
        expect(calls).toHaveLength(1);
        const [{ method, args }] = calls;
        expect(method).toBe("bot_edit_message");
        // Valid as OpenChat's args, as the agent checks them before sending
        expect(Value.Check(LocalUserIndexBotEditMessageArgs, args)).toBe(true);
        expect(args.chat_context).toEqual({
            Autonomous: { Channel: [Principal.fromText(COMMUNITY).toUint8Array(), 7n] },
        });
        expect(args.thread).toBe(12);
        expect(args.message_id).toBe(18446744073709551615n);
        expect(args.block_level_markdown).toBe(false);
        expect(args.content).toEqual({ Text: { text: "edited" } });
    });

    test("edits a channel's message from a community's scope", async () => {
        const calls = stubEdit();
        const autonomous = ActionContext.inAutonomousContext(
            new CommunityActionScope(new CommunityIdentifier(COMMUNITY)),
            "aaaaa-aa",
        );

        const message = new TextMessage("edited").setChannelId<TextMessage>(7n);
        await client(autonomous).editMessage(5n, message);

        expect(calls[0].args.chat_context).toEqual({
            Autonomous: { Channel: [Principal.fromText(COMMUNITY).toUint8Array(), 7n] },
        });
        expect(calls[0].args.thread).toBeUndefined();
    });

    test("refuses to edit with a command's context", async () => {
        const calls = stubEdit();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const command = new ActionContext(
            "aaaaa-aa",
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            undefined,
            undefined,
            1n,
            undefined,
            "a.command.jwt",
        );

        const response = await client(command).editMessage(1n, new TextMessage("edited"));

        expect(response.kind).toBe("error");
        expect(calls).toHaveLength(0);
    });

    test("refuses an edit the bot hasn't the permission for", async () => {
        const calls = stubEdit();
        const autonomous = ActionContext.inAutonomousContext(
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            "aaaaa-aa",
            new Permissions(
                Permissions.encodePermissions({ community: [], chat: [], message: ["Image"] }),
            ),
        );

        const response = await client(autonomous).editMessage(1n, new TextMessage("edited"));

        expect(response.kind).toBe("error");
        expect(calls).toHaveLength(0);
    });
});
