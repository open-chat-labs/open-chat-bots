import type { HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { Value } from "@sinclair/typebox/value";
import { Packr, type Options } from "msgpackr";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BotClient } from "../clients/bot_client";
import type { BotClientConfig } from "../domain";
import { ActionContext } from "../domain/action_context";
import { ChannelIdentifier, CommunityIdentifier, GroupChatIdentifier } from "../domain/identifiers";
import type { MiniAppContent, MiniAppStatus } from "../domain/event";
import {
    MINI_APP_MAX_TEXT_CHARS,
    MiniAppMessage,
    TextMessage,
    validateMiniAppContent,
    validateMiniAppImage,
    validateMiniAppText,
} from "../domain/message";
import { acceptMiniAppStart, miniAppGameKey, refuseMiniAppStart } from "../domain/mini_app";
import { Permissions } from "../domain/permissions";
import { ChatActionScope, CommunityActionScope } from "../domain/scope";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import { DataClient } from "../services/data/data.client";
import {
    BotMessageContent as ApiBotMessageContent,
    MessageContent as ApiMessageContent,
    LocalUserIndexBotEditMessageArgs,
    LocalUserIndexBotMiniAppPostTokenArgs,
} from "../typebox/typebox";
import { apiMiniAppCard, apiMiniAppGame, messageContent, miniAppGame } from "./index";

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
const ALICE = "rdmx6-jaaaa-aaaaa-aaadq-cai";
const BOB = "qhbym-qaaaa-aaaaa-aaafq-cai";

const bytes = (id: string) => Principal.fromText(id).toUint8Array();

// A new card, as OpenChat sends one and as `MiniAppMessage` makes one
const OPEN_CARD = { spectators: false, status: "Open" };
const OPEN: Omit<MiniAppContent, "kind" | "text"> = {
    spectators: false,
    status: { kind: "open" },
};

const IMAGE = {
    width: 640,
    height: 360,
    mimeType: "image/png",
    blobReference: { canisterId: BUCKET, blobId: 340282366920938463463374607431768211455n },
};

// A card as OpenChat sends one from a chat, in msgpack, as the SDK reads it
function read(card: object) {
    const wire = Packer.pack({ MiniApp: { text: TEXT, ...card } });
    return messageContent(Value.Parse(ApiMessageContent, Packer.unpack(wire)), SENDER);
}

// A card as the SDK sends it, after a round trip through msgpack, as OpenChat reads it
function sent(message: MiniAppMessage) {
    const content = Value.Parse(ApiBotMessageContent, message.toResponse().content);
    return Packer.unpack(Packer.pack(content));
}

describe("MiniApp cards", () => {
    test("are read from a chat as OpenChat sends them, while open", () => {
        expect(read(OPEN_CARD)).toEqual({ kind: "mini_app_content", text: TEXT, ...OPEN });
    });

    test("are read with their players and whose turn it is, while active", () => {
        const card = read({
            max_players: 4,
            spectators: true,
            status: { Active: { players: [bytes(ALICE), bytes(BOB)], waiting_for: [bytes(BOB)] } },
        });

        expect(card).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            maxPlayers: 4,
            spectators: true,
            status: { kind: "active", players: [ALICE, BOB], waitingFor: [BOB] },
        });
    });

    test("are read with everything OpenChat sends, once finished", () => {
        // A u128 as a string, as OpenChat writes large ints, and principals as bytes
        const card = read({
            image: {
                width: 640,
                height: 360,
                mime_type: "image/png",
                blob_reference: {
                    canister_id: bytes(BUCKET),
                    blob_id: "340282366920938463463374607431768211455",
                },
            },
            max_players: 2,
            spectators: true,
            status: { Finished: { players: [bytes(ALICE), bytes(BOB)], result: "Bob won" } },
        });

        expect(card).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            image: IMAGE,
            maxPlayers: 2,
            spectators: true,
            status: { kind: "finished", players: [ALICE, BOB], result: "Bob won" },
        });
    });

    test("are read finished without a result, or players, if the game was abandoned", () => {
        expect(read({ spectators: false, status: { Finished: { players: [] } } })).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            spectators: false,
            status: { kind: "finished", players: [], result: undefined },
        });
    });

    test("are sent open, as OpenChat reads them, with the fields it needs", () => {
        const message = new MiniAppMessage(TEXT);

        expect(sent(message)).toEqual({ MiniApp: { text: TEXT, ...OPEN_CARD } });
        expect(message.requiredMessagePermissions).toEqual(["MiniApp"]);
    });

    test("are sent with their image, player limit and spectators", () => {
        const message = new MiniAppMessage(TEXT, IMAGE).setMaxPlayers(2).setSpectators(true);
        const wire = sent(message);

        // The u128 as a string and the bucket as principal bytes, as for an image message
        expect(wire.MiniApp.image.blob_reference.blob_id).toBe(
            "340282366920938463463374607431768211455",
        );
        expect(Uint8Array.from(wire.MiniApp.image.blob_reference.canister_id)).toEqual(
            bytes(BUCKET),
        );
        expect(wire.MiniApp).toMatchObject({ max_players: 2, spectators: true, status: "Open" });
        expect(messageContent(Value.Parse(ApiMessageContent, wire), SENDER)).toEqual({
            kind: "mini_app_content",
            text: TEXT,
            image: IMAGE,
            maxPlayers: 2,
            spectators: true,
            status: { kind: "open" },
        });
        expect(message.validate()).toBeUndefined();
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

    test("are written for the service to post, with the blob id as a decimal string", () => {
        const message = new MiniAppMessage(TEXT, IMAGE).setMaxPlayers(2).setSpectators(true);

        expect(message.card).toEqual({ text: TEXT, image: IMAGE, maxPlayers: 2, spectators: true });
        expect(JSON.stringify(apiMiniAppCard(message.card))).toBe(
            `{"text":"${TEXT}","image":{"width":640,"height":360,"mime_type":"image/png","blob_reference":{"canister_id":"${BUCKET}","blob_id":"340282366920938463463374607431768211455"}},"max_players":2,"spectators":true}`,
        );
        // Leaving out what the card hasn't
        expect(JSON.stringify(apiMiniAppCard(new MiniAppMessage(TEXT).card))).toBe(
            `{"text":"${TEXT}","spectators":false}`,
        );
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
        expect(new MiniAppMessage(" ").validate()).toBe("The text must have 1 to 2000 characters");
    });
});

describe("validateMiniAppImage", () => {
    test("needs a width, a height and an image's mime type, with OpenChat's errors", () => {
        expect(validateMiniAppImage(1, 1, "image/webp")).toBeUndefined();
        expect(new MiniAppMessage(TEXT, IMAGE).validate()).toBeUndefined();

        expect(validateMiniAppImage(2 ** 32 - 1, 2 ** 32 - 1, "image/png")).toBeUndefined();
        for (const [width, height] of [
            [0, 10],
            [10, 0],
            [NaN, 10],
            // Whole numbers which fit a u32, as OpenChat holds them
            [1.5, 10],
            [10, 2 ** 32],
            [-1, 10],
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

describe("validateMiniAppContent", () => {
    const card = (change: Partial<MiniAppContent> = {}) => ({ text: TEXT, ...OPEN, ...change });

    test("passes a new card within OpenChat's limits", () => {
        expect(validateMiniAppContent(card())).toBeUndefined();
        for (const maxPlayers of [1, 2, 100]) {
            expect(validateMiniAppContent(card({ maxPlayers }))).toBeUndefined();
        }
        expect(validateMiniAppContent(card({ image: IMAGE, spectators: true }))).toBeUndefined();
        expect(new MiniAppMessage(TEXT).setMaxPlayers(100).validate()).toBeUndefined();
    });

    test("refuses one beyond them, with OpenChat's errors", () => {
        const error = (change: Partial<MiniAppContent>) => validateMiniAppContent(card(change));

        for (const maxPlayers of [0, 101, 1.5]) {
            expect(error({ maxPlayers })).toBe("A game has 1 to 100 players at most");
        }
        expect(new MiniAppMessage(TEXT).setMaxPlayers(0).validate()).toBe(
            "A game has 1 to 100 players at most",
        );
        expect(error({ text: "" })).toBe("The text must have 1 to 2000 characters");
        expect(error({ image: { ...IMAGE, mimeType: "text/plain" } })).toBe(
            "The image's mime type must be an image's",
        );
    });

    // Only the MiniApp service writes a card's status
    test("refuses a card that isn't open", () => {
        const statuses: MiniAppStatus[] = [
            { kind: "active", players: [ALICE], waitingFor: [] },
            { kind: "finished", players: [], result: "Bob won" },
        ];
        for (const status of statuses) {
            expect(validateMiniAppContent(card({ status }))).toBe("A game is posted open");
        }
    });
});

describe("MiniApp games", () => {
    const channelGame = {
        chat: new ChannelIdentifier(COMMUNITY, 7n),
        thread: 3,
        messageId: 18446744073709551615n,
    };
    const groupGame = { chat: new GroupChatIdentifier(GROUP), messageId: 5n };

    test("are written as the MiniApp service reads them", () => {
        expect(JSON.stringify(apiMiniAppGame(channelGame))).toBe(
            `{"chat":{"Channel":["${COMMUNITY}",7]},"thread":3,"message_id":"18446744073709551615"}`,
        );
        expect(JSON.stringify(apiMiniAppGame(groupGame))).toBe(
            `{"chat":{"Group":"${GROUP}"},"thread":null,"message_id":"5"}`,
        );
    });

    test("are read as the MiniApp service writes them", () => {
        for (const game of [channelGame, groupGame]) {
            const json = JSON.parse(JSON.stringify(apiMiniAppGame(game)));

            expect(miniAppGame(json)).toEqual({ thread: undefined, ...game });
        }
    });

    test("have a key unique across chats and threads", () => {
        const keys = [
            channelGame,
            { ...channelGame, thread: undefined },
            { ...channelGame, chat: new ChannelIdentifier(COMMUNITY, 8n) },
            { ...channelGame, chat: new GroupChatIdentifier(COMMUNITY) },
            { ...channelGame, messageId: 1n },
        ].map(miniAppGameKey);

        expect(new Set(keys).size).toBe(keys.length);
        expect(miniAppGameKey({ ...channelGame })).toBe(miniAppGameKey(channelGame));
    });
});

describe("A bot's answer to starting a game", () => {
    test("starts it, as the MiniApp service reads it", () => {
        const response = acceptMiniAppStart({
            players: [ALICE, BOB],
            waitingFor: [ALICE],
            state: { seq: 1, shared: { turn: 0 }, private: { [ALICE]: { hand: [1] }, [BOB]: {} } },
        });

        expect(JSON.stringify(response)).toBe(
            `{"accepted":true,"players":["${ALICE}","${BOB}"],"waiting_for":["${ALICE}"],"state":{"seq":1,"shared":{"turn":0},"private":{"${ALICE}":{"hand":[1]},"${BOB}":{}}}}`,
        );
        // Without a state, or whose turn it is
        expect(JSON.stringify(acceptMiniAppStart({ players: [ALICE], waitingFor: [] }))).toBe(
            `{"accepted":true,"players":["${ALICE}"],"waiting_for":[]}`,
        );
    });

    test("refuses, with a message for the player", () => {
        expect(JSON.stringify(refuseMiniAppStart("Needs 2 players"))).toBe(
            `{"accepted":false,"message":"Needs 2 players"}`,
        );
        expect(JSON.stringify(refuseMiniAppStart())).toBe(`{"accepted":false}`);
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
            ...OPEN,
        });
    });

    // eg. a bot installed in a community, posting in one of its channels autonomously
    test("uploads the image for the community, in a community's scope", async () => {
        const upload = stubUpload();
        const context = ActionContext.inAutonomousContext(
            new CommunityActionScope(new CommunityIdentifier(COMMUNITY)),
            "aaaaa-aa",
        );
        const data = new Uint8Array([1]);

        const message = await new BotClient({} as HttpAgent, config, context).createMiniAppMessage(
            TEXT,
            { data, mimeType: "image/png", width: 640, height: 360 },
        );

        expect(upload).toHaveBeenCalledWith([COMMUNITY], "image/png", data);
        expect(message.setChannelId<MiniAppMessage>(7n).validate()).toBeUndefined();
    });

    test("uploads nothing for a card without an image", async () => {
        const upload = stubUpload();

        const message = await client().createMiniAppMessage(TEXT);

        expect(upload).not.toHaveBeenCalled();
        expect(message.toResponse().content).toEqual({ MiniApp: { text: TEXT, ...OPEN_CARD } });
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

describe("BotClient.miniAppPostToken", () => {
    const config: BotClientConfig = {
        openStorageCanisterId: "aaaaa-aa",
        icHost: "https://icp-api.io",
        identityPrivateKey: "not-used",
        openchatPublicKey: "not-used",
        autoFetchOgPreviews: false,
    };

    // The LocalUserIndex, answering `response` to the bot's query, keeping what it was asked
    function stubQuery(response: unknown = { Success: "post.token" }) {
        const calls: { method: string; args: LocalUserIndexBotMiniAppPostTokenArgs }[] = [];
        vi.spyOn(
            MsgpackCanisterAgent.prototype as unknown as {
                executeMsgpackQuery: (...args: unknown[]) => Promise<unknown>;
            },
            "executeMsgpackQuery",
        ).mockImplementation((method: unknown, args: unknown, mapper: unknown) => {
            calls.push({
                method: method as string,
                args: args as LocalUserIndexBotMiniAppPostTokenArgs,
            });
            return Promise.resolve((mapper as (resp: unknown) => unknown)(response));
        });
        return calls;
    }

    function client(context: ActionContext) {
        return new BotClient({} as HttpAgent, config, context);
    }

    function command(permissions: Permissions) {
        return new ActionContext(
            "aaaaa-aa",
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            permissions,
            undefined,
            1n,
            undefined,
            "a.command.jwt",
        );
    }

    function granted(...message: ("MiniApp" | "Text")[]) {
        return new Permissions(Permissions.encodePermissions({ community: [], chat: [], message }));
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("asks the LocalUserIndex for a token for the chat, as a message would be sent", async () => {
        const calls = stubQuery();
        const autonomous = ActionContext.inAutonomousContext(
            new ChatActionScope(new GroupChatIdentifier(GROUP)),
            "aaaaa-aa",
        );

        const token = await client(autonomous).miniAppPostToken({ thread: 3, messageId: 5n });

        expect(token).toBe("post.token");
        expect(calls).toHaveLength(1);
        const [{ method, args }] = calls;
        expect(method).toBe("bot_mini_app_post_token");
        // Valid as OpenChat's args, as the agent checks them before sending
        expect(Value.Check(LocalUserIndexBotMiniAppPostTokenArgs, args)).toBe(true);
        expect(args).toEqual({
            chat_context: { Autonomous: { Group: bytes(GROUP) } },
            channel_id: undefined,
            thread: 3,
            message_id: 5n,
        });
    });

    test("sends a command's token, whose message id the card takes", async () => {
        const calls = stubQuery();

        await client(command(granted("MiniApp"))).miniAppPostToken();

        expect(calls[0].args).toEqual({
            chat_context: { Command: "a.command.jwt" },
            channel_id: undefined,
            thread: undefined,
            message_id: undefined,
        });
    });

    test("names the channel, in a community's scope", async () => {
        const calls = stubQuery();
        const autonomous = ActionContext.inAutonomousContext(
            new CommunityActionScope(new CommunityIdentifier(COMMUNITY)),
            "aaaaa-aa",
        );

        await client(autonomous).miniAppPostToken({ channelId: 7n });

        expect(calls[0].args.chat_context).toEqual({
            Autonomous: { Channel: [bytes(COMMUNITY), 7n] },
        });
        expect(calls[0].args.channel_id).toBe(7n);
    });

    test("refuses without the MiniApp permission, asking for nothing", async () => {
        const calls = stubQuery();

        await expect(client(command(granted("Text"))).miniAppPostToken()).rejects.toThrow(
            "MiniApp permission",
        );
        expect(calls).toHaveLength(0);
    });

    test("rejects with OpenChat's error when the bot isn't given one", async () => {
        stubQuery({ Error: [207, "Bot not found"] });

        await expect(client(command(granted("MiniApp"))).miniAppPostToken()).rejects.toThrow(
            "Unable to get a MiniApp post token: 207 Bot not found",
        );
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
