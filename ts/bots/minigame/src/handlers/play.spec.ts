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
    const options: unknown[] = [];
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
            post: async (token: string, card: MiniAppMessage, opts: unknown) => {
                posted.push(card.card);
                options.push(opts);
                return post(token, card);
            },
        }),
    } as unknown as Deps;
    return { store, posted, options, deps };
}

/** Every answer the command gives, of which there should be one, and when it's finished */
function run(deps: Deps): { answers: { status: number; body: unknown }[]; done: Promise<void> } {
    const answers: { status: number; body: unknown }[] = [];
    let status = 200;
    const res = {
        headersSent: false,
        status(code: number) {
            status = code;
            return res;
        },
        json(body: unknown) {
            answers.push({ status, body });
            return res;
        },
    } as unknown as Response;
    const done = executeCommand(
        { headers: { "x-oc-jwt": "jwt" } } as unknown as Request,
        res,
        deps,
    );
    return { answers, done };
}

describe("/play", () => {
    it("answers with the card it posted, as the command's message, so it shows at once", async () => {
        let posting: () => void = () => {};
        const { store, posted, deps } = setUp(
            () => new Promise<void>((resolve) => (posting = resolve)),
        );

        const { answers, done } = run(deps);
        await vi.waitFor(() => expect(posted).toHaveLength(1));
        // Nothing's said until the card's posted, as the answer's for a card that exists
        expect(answers).toHaveLength(0);
        posting();
        await done;

        expect(answers).toHaveLength(1);
        const [answer] = answers;
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

    it("has the host playing from the start, and asks the service to put them on the card", async () => {
        const { store, options, deps } = setUp(async () => undefined);

        await run(deps).done;

        const play = store.get({
            chat: new GroupChatIdentifier(GROUP),
            messageId: MESSAGE_ID,
        })!.play;
        expect(play.isSeated("alice")).toBe(true);
        expect(play.host).toBe("alice");
        expect(options).toEqual([{ joinInitiator: true }]);
    });

    it("answers with only an ephemeral message if the card couldn't be posted", async () => {
        const { store, deps } = setUp(async () => {
            throw new MiniAppServiceError("invalid", 400, "The chat is frozen");
        });

        const { answers, done } = run(deps);
        await done;

        expect(answers).toHaveLength(1);
        expect(answers[0].body).toEqual({
            message: { ephemeral: true, text: "The game couldn't be set up: The chat is frozen." },
        });
        expect(
            store.get({ chat: new GroupChatIdentifier(GROUP), messageId: MESSAGE_ID }),
        ).toBeUndefined();
    });
});
