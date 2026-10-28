import type { HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { Value } from "@sinclair/typebox/value";
import { Packr, type Options } from "msgpackr";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BotClient } from "../clients/bot_client";
import type { BotClientConfig, MessageButton, MiniAppContent } from "../domain";
import { ActionContext } from "../domain/action_context";
import { ChannelIdentifier, CommunityIdentifier, GroupChatIdentifier } from "../domain/identifiers";
import {
    MiniAppLimits,
    MiniAppMessage,
    TextMessage,
    validateMiniAppContent,
} from "../domain/message";
import { Permissions } from "../domain/permissions";
import { ChatActionScope, CommunityActionScope } from "../domain/scope";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import {
    BotMessageContent as ApiBotMessageContent,
    BotEventWrapper as ApiBotEventWrapper,
    MessageContent as ApiMessageContent,
    LocalUserIndexBotEditMessageArgs,
} from "../typebox/typebox";
import { botEventWrapper, messageContent, miniAppContent, principalBytesToString } from "./index";

const Packer = new Packr({
    useRecords: false,
    skipValues: [undefined],
    largeBigIntToString: true,
} as unknown as Options);

const HOST = "rdmx6-jaaaa-aaaaa-aaadq-cai";
const SENDER = "2yfsq-kaaaa-aaaaf-aaa4q-cai";
const GROUP = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const COMMUNITY = "r7inp-6aaaa-aaaaa-aaabq-cai";

function miniApp(): MiniAppContent {
    return {
        kind: "mini_app_content",
        text: "**Uno** · 2 of 4 players",
        buttonRows: [
            [
                { id: "join", label: "Join", style: "primary" },
                { id: "start", label: "Start", style: "danger", visibleTo: [HOST] },
            ],
        ],
    };
}

describe("MiniApp content", () => {
    test("is read from a chat", () => {
        // As OpenChat sends it: user ids as principal bytes, and no visible_to for everyone
        const wire = Packer.pack({
            MiniApp: {
                text: "**Uno** · 2 of 4 players",
                button_rows: [
                    [
                        { id: "join", label: "Join", style: "Primary" },
                        {
                            id: "start",
                            label: "Start",
                            style: "Danger",
                            visible_to: [Principal.fromText(HOST).toUint8Array()],
                        },
                    ],
                ],
            },
        });

        const api = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(messageContent(api, SENDER)).toEqual(miniApp());
    });

    test("is sent as it was given", () => {
        const message = new MiniAppMessage(miniApp());
        const wire = Packer.pack(Value.Parse(ApiBotMessageContent, message.toResponse().content));
        const content = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(message.requiredMessagePermissions).toEqual(["MiniApp"]);
        expect("MiniApp" in content).toBe(true);
        if ("MiniApp" in content) {
            const [join, start] = content.MiniApp.button_rows[0];
            expect(join.style).toBe("Primary");
            // Left out for everyone, rather than sent as null
            expect("visible_to" in join).toBe(false);
            expect(start.visible_to?.map(principalBytesToString)).toEqual([HOST]);
            expect(miniAppContent(content.MiniApp)).toEqual(miniApp());
        }
    });

    test("needs message permission 11", () => {
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

describe("validateMiniAppContent", () => {
    test("passes content within the limits", () => {
        expect(validateMiniAppContent(miniApp())).toBeUndefined();
        expect(new MiniAppMessage(miniApp()).validate()).toBeUndefined();

        const largest: Omit<MiniAppContent, "kind"> = {
            text: "x".repeat(MiniAppLimits.MAX_TEXT_CHARS),
            buttonRows: Array.from({ length: MiniAppLimits.MAX_ROWS }, (_, row) =>
                Array.from({ length: MiniAppLimits.MAX_BUTTONS_PER_ROW }, (_, i) => ({
                    id: `${row}-${i}-`.padEnd(MiniAppLimits.MAX_ID_BYTES, "x"),
                    label: "é".repeat(MiniAppLimits.MAX_LABEL_CHARS),
                    style: "secondary" as const,
                    visibleTo: Array(MiniAppLimits.MAX_VISIBLE_TO).fill(HOST),
                })),
            ),
        };
        expect(validateMiniAppContent(largest)).toBeUndefined();

        expect(validateMiniAppContent({ ...miniApp(), buttonRows: [] })).toBeUndefined();
    });

    test("refuses content beyond the limits", () => {
        const invalid = (change: (c: MiniAppContent) => void) => {
            const content = miniApp();
            change(content);
            expect(validateMiniAppContent(content), JSON.stringify(content)).toBeDefined();
        };
        const first = (c: MiniAppContent): MessageButton => c.buttonRows[0][0];

        invalid((c) => (c.text = " "));
        invalid((c) => (c.text = "x".repeat(MiniAppLimits.MAX_TEXT_CHARS + 1)));
        invalid((c) => (c.buttonRows = Array(MiniAppLimits.MAX_ROWS + 1).fill(c.buttonRows[0])));
        invalid((c) => c.buttonRows.push([]));
        invalid(
            (c) =>
                (c.buttonRows[0] = Array.from(
                    { length: MiniAppLimits.MAX_BUTTONS_PER_ROW + 1 },
                    (_, i) => ({ ...first(c), id: `${i}` }),
                )),
        );
        invalid((c) => (first(c).id = ""));
        invalid((c) => (first(c).id = "x".repeat(MiniAppLimits.MAX_ID_BYTES + 1)));
        // Counted in bytes, so 33 two-byte characters are too many
        invalid((c) => (first(c).id = "é".repeat(MiniAppLimits.MAX_ID_BYTES / 2 + 1)));
        invalid((c) => (c.buttonRows[0][1].id = first(c).id));
        // Unique across rows, not only within one
        invalid((c) => c.buttonRows.push([{ ...first(c) }]));
        invalid((c) => (first(c).label = ""));
        invalid((c) => (first(c).label = "x".repeat(MiniAppLimits.MAX_LABEL_CHARS + 1)));
        invalid((c) => (first(c).visibleTo = Array(MiniAppLimits.MAX_VISIBLE_TO + 1).fill(HOST)));
    });

    test("gives OpenChat's errors", () => {
        expect(validateMiniAppContent({ ...miniApp(), text: "" })).toBe(
            "The text must have 1 to 2000 characters",
        );
        expect(
            validateMiniAppContent({
                text: "x",
                buttonRows: [
                    [{ id: "a", label: "A", style: "primary" }],
                    [{ id: "a", label: "B", style: "primary" }],
                ],
            }),
        ).toBe("Two buttons have the id a");
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

        const message = new MiniAppMessage(miniApp()).setThread<MiniAppMessage>(12);
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
        expect("MiniApp" in args.content && args.content.MiniApp.text).toBe(miniApp().text);
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

        const response = await client(command).editMessage(1n, new MiniAppMessage(miniApp()));

        expect(response.kind).toBe("error");
        expect(calls).toHaveLength(0);
    });

    test("refuses an edit the bot hasn't the permission for", async () => {
        const calls = stubEdit();
        const autonomous = ActionContext.inAutonomousContext(
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            "aaaaa-aa",
            new Permissions(
                Permissions.encodePermissions({ community: [], chat: [], message: ["Text"] }),
            ),
        );

        const response = await client(autonomous).editMessage(1n, new MiniAppMessage(miniApp()));

        expect(response.kind).toBe("error");
        expect(calls).toHaveLength(0);
    });
});

describe("bot chat events", () => {
    test("carry the tip they're for", () => {
        const wire = Packer.pack({
            api_gateway: Principal.fromText("aaaaa-aa").toUint8Array(),
            event: {
                Chat: {
                    event: "Empty",
                    chat: { Group: Principal.fromText(GROUP).toUint8Array() },
                    event_index: 4,
                    latest_event_index: 5,
                    tip: {
                        tipped_by: Principal.fromText(HOST).toUint8Array(),
                        ledger: Principal.fromText(SENDER).toUint8Array(),
                        token_symbol: "CHAT",
                        amount: 100_000_000n,
                        held_for: { Telegram: 42n },
                    },
                },
            },
            timestamp: 1n,
            notification_index: 2n,
        });

        const wrapper = botEventWrapper(Value.Parse(ApiBotEventWrapper, Packer.unpack(wire)));

        expect(wrapper.event.kind === "bot_chat_event" && wrapper.event.tip).toEqual({
            tippedBy: HOST,
            ledger: SENDER,
            tokenSymbol: "CHAT",
            amount: 100_000_000n,
            heldFor: { platform: "telegram", id: 42n },
        });
    });
});
