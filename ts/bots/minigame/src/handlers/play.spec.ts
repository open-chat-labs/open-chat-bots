// `/play`, with OpenChat and the MiniApp service stubbed: what it posts, and how it answers
import {
    GroupChatIdentifier,
    MiniAppMessage,
    MiniAppServiceError,
    type MiniAppCard,
    type MiniAppSize,
} from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { Deps } from "../deps";
import { RACE_2048 } from "../games/registry";
import { GameStore } from "../store";
import { executeCommand } from "./play";

const GROUP = "aaaaa-aa";
const MESSAGE_ID = 7n;

/** A post token for the command's message, which the bot only reads */
function postToken(): string {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claims = {
        claim_type: "MiniAppPost",
        game: { chat: { Group: GROUP }, message_id: MESSAGE_ID.toString() },
    };
    return `${part({ alg: "none" })}.${part(claims)}.`;
}

function setUp(post: (token: string, card: MiniAppMessage) => Promise<unknown>) {
    const store = new GameStore();
    const posted: MiniAppCard[] = [];
    // `/play 2048` in a group, from alice
    const client = {
        commandName: "play",
        stringArg: (name: string) => (name === "game" ? RACE_2048.id : undefined),
        chatScope: { toString: () => `group ${GROUP}` },
        apiGateway: "gateway",
        initiator: "alice",
        createMiniAppMessage: async (app: string, text: string, size: MiniAppSize) =>
            new MiniAppMessage(app, text, size).setContextMessageId<MiniAppMessage>(MESSAGE_ID),
        miniAppPostToken: async () => postToken(),
        createTextMessage: async (text: string) => ({
            makeEphemeral: () => ({
                setFinalised: () => ({ toResponse: () => ({ ephemeral: true, text }) }),
            }),
        }),
    };
    const deps = {
        factory: { createClientFromCommandJwt: () => client },
        store,
        publisher: { publish: vi.fn() },
        names: { lookup: async (id: string) => id.toUpperCase() },
        useApiGateway: () => ({
            post: async (token: string, card: MiniAppMessage) => {
                posted.push(card.card);
                return post(token, card);
            },
        }),
    } as unknown as Deps;
    return { store, posted, deps };
}

async function run(deps: Deps): Promise<{ status: number; body: unknown }> {
    const answer = { status: 200, body: undefined as unknown };
    const res = {
        headersSent: false,
        status(code: number) {
            answer.status = code;
            return res;
        },
        json(value: unknown) {
            answer.body = value;
            return res;
        },
    } as unknown as Response;
    await executeCommand({ headers: { "x-oc-jwt": "jwt" } } as unknown as Request, res, deps);
    return answer;
}

describe("/play", () => {
    it("answers with the card it posted, as the command's message, so it shows at once", async () => {
        const { store, posted, deps } = setUp(async () => undefined);

        const answer = await run(deps);

        expect(posted).toHaveLength(1);
        expect(answer.status).toBe(200);
        const { message } = answer.body as {
            message: {
                id: bigint;
                content: { MiniApp: object };
                finalised: boolean;
                ephemeral: boolean;
            };
        };
        expect(message.id).toBe(MESSAGE_ID);
        expect(message.finalised).toBe(true);
        expect(message.ephemeral).toBe(false);
        expect(message.content.MiniApp).toMatchObject({
            app: RACE_2048.id,
            text: RACE_2048.cardText,
            max_players: RACE_2048.maxPlayers,
            spectators: RACE_2048.spectators,
        });
        expect(
            store.get({ chat: new GroupChatIdentifier(GROUP), messageId: MESSAGE_ID }),
        ).toBeDefined();
    });

    it("answers with only an ephemeral message if the card couldn't be posted", async () => {
        const { store, deps } = setUp(async () => {
            throw new MiniAppServiceError("rejected", 400, "The chat is frozen");
        });

        const answer = await run(deps);

        expect(answer.body).toEqual({
            message: { ephemeral: true, text: "The game couldn't be set up: The chat is frozen." },
        });
        expect(
            store.get({ chat: new GroupChatIdentifier(GROUP), messageId: MESSAGE_ID }),
        ).toBeUndefined();
    });
});
