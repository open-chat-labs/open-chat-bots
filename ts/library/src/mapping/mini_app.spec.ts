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
    validateMiniAppImage,
    validateMiniAppText,
} from "../domain/message";
import { Permissions } from "../domain/permissions";
import { ChatActionScope, CommunityActionScope } from "../domain/scope";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import { DataClient } from "../services/data/data.client";
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
const BUCKET = "rturd-qaaaa-aaaaf-aabaq-cai";

const IMAGE = {
    width: 640,
    height: 360,
    mimeType: "image/png",
    blobReference: { canisterId: BUCKET, blobId: 340282366920938463463374607431768211455n },
};

describe("MiniApp cards", () => {
    test("are read from a chat as OpenChat sends them", () => {
        const wire = Packer.pack({ MiniApp: { text: TEXT } });

        const api = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(messageContent(api, SENDER)).toEqual({ kind: "mini_app_content", text: TEXT });
    });

    test("are read with their image, as OpenChat sends it", () => {
        // A u128 as a string, as OpenChat writes large ints, and the bucket as principal bytes
        const wire = Packer.pack({
            MiniApp: {
                text: TEXT,
                image: {
                    width: 640,
                    height: 360,
                    mime_type: "image/png",
                    blob_reference: {
                        canister_id: Principal.fromText(BUCKET).toUint8Array(),
                        blob_id: "340282366920938463463374607431768211455",
                    },
                },
            },
        });

        const api = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(messageContent(api, SENDER)).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            image: IMAGE,
        });
    });

    test("are sent as OpenChat reads them", () => {
        const message = new MiniAppMessage(TEXT);
        const sent = Value.Parse(ApiBotMessageContent, message.toResponse().content);

        // Without an image, rather than a nil one
        expect(Packer.unpack(Packer.pack(sent))).toEqual({ MiniApp: { text: TEXT } });
        expect(message.requiredMessagePermissions).toEqual(["MiniApp"]);
    });

    test("are sent with their image", () => {
        const message = new MiniAppMessage(TEXT, IMAGE);
        const sent = Value.Parse(ApiBotMessageContent, message.toResponse().content);
        const wire = Packer.unpack(Packer.pack(sent));

        // The u128 as a string and the bucket as principal bytes, as for an image message
        expect(wire.MiniApp.image.blob_reference.blob_id).toBe(
            "340282366920938463463374607431768211455",
        );
        expect(Uint8Array.from(wire.MiniApp.image.blob_reference.canister_id)).toEqual(
            Principal.fromText(BUCKET).toUint8Array(),
        );
        expect(messageContent(Value.Parse(ApiMessageContent, wire), SENDER)).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            image: IMAGE,
        });
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

describe("validateMiniAppImage", () => {
    test("needs a width, a height and an image's mime type, with OpenChat's errors", () => {
        expect(validateMiniAppImage(1, 1, "image/webp")).toBeUndefined();
        expect(new MiniAppMessage(TEXT, IMAGE).validate()).toBeUndefined();

        for (const [width, height] of [
            [0, 10],
            [10, 0],
            [NaN, 10],
        ]) {
            expect(validateMiniAppImage(width, height, "image/png")).toBe(
                "The image must have a width and a height",
            );
        }
        for (const mimeType of ["video/mp4", "application/octet-stream", ""]) {
            expect(validateMiniAppImage(10, 10, mimeType)).toBe(
                "The image's mime type must be an image's",
            );
        }
        expect(new MiniAppMessage(TEXT, { ...IMAGE, width: 0 }).validate()).toBe(
            "The image must have a width and a height",
        );
    });
});

describe("BotClient.createMiniAppMessage", () => {
    const config: BotClientConfig = {
        openStorageCanisterId: "aaaaa-aa",
        icHost: "https://icp-api.io",
        identityPrivateKey: "not-used",
        openchatPublicKey: "not-used",
        autoFetchOgPreviews: false,
    };

    function client() {
        const context = ActionContext.inAutonomousContext(
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            "aaaaa-aa",
        );
        return new BotClient({} as HttpAgent, config, context);
    }

    function stubUpload() {
        return vi.spyOn(DataClient.prototype, "uploadData").mockResolvedValue(IMAGE.blobReference);
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("uploads the image, for the chat, then makes the card", async () => {
        const upload = stubUpload();
        const data = new Uint8Array([1, 2, 3]);

        const message = await client().createMiniAppMessage(TEXT, {
            data,
            mimeType: "image/png",
            width: 640,
            height: 360,
        });

        expect(upload).toHaveBeenCalledWith([GROUP], "image/png", data);
        const content = Value.Parse(ApiBotMessageContent, message.toResponse().content);
        expect("MiniApp" in content && messageContent(content, SENDER)).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            image: IMAGE,
        });
    });

    test("uploads nothing for a card without an image", async () => {
        const upload = stubUpload();

        const message = await client().createMiniAppMessage(TEXT);

        expect(upload).not.toHaveBeenCalled();
        expect(message.toResponse().content).toEqual({ MiniApp: { text: TEXT } });
    });

    test("doesn't upload an image OpenChat would refuse", async () => {
        const upload = stubUpload();
        const data = new Uint8Array([1]);

        await expect(
            client().createMiniAppMessage(TEXT, {
                data,
                mimeType: "image/png",
                width: 0,
                height: 1,
            }),
        ).rejects.toThrow("The image must have a width and a height");
        await expect(
            client().createMiniAppMessage(TEXT, {
                data,
                mimeType: "text/plain",
                width: 1,
                height: 1,
            }),
        ).rejects.toThrow("The image's mime type must be an image's");
        expect(upload).not.toHaveBeenCalled();
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
