import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BadRequestError } from "../utils/badrequest";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import {
    API_GATEWAY,
    BOT_ID,
    GAME_JSON,
    GROUP,
    USER,
    postToken,
    publicKeyPem,
    sign,
} from "../utils/test_tokens";
import { BotClientFactory } from "./client_factory";
import { GlobalClient } from "./global_client";

function factory(): BotClientFactory {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
    return new BotClientFactory({
        openchatPublicKey: publicKeyPem(),
        icHost: "https://icp-api.io",
        identityPrivateKey: privateKey.export({ type: "sec1", format: "pem" }).toString(),
        openStorageCanisterId: "aaaaa-aa",
    });
}

// A command's token, as OpenChat writes it, expiring an hour from now
function commandToken(claimType: string): string {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return sign(
        `{"exp":${exp},"claim_type":"${claimType}","bot_api_gateway":"${API_GATEWAY}","bot":"${BOT_ID}","scope":{"Chat":{"chat":{"Group":"${GROUP}"},"thread":null,"message_id":"1","user_message_id":null}},"granted_permissions":{"message":1},"command":{"name":"roll","args":[],"initiator":"${USER}","meta":null}}`,
    );
}

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("BotClientFactory.createClientFromCommandJwt", () => {
    test("takes a command's token", () => {
        const client = factory().createClientFromCommandJwt(commandToken("BotActionByCommand"));

        expect(client.commandName).toBe("roll");
        expect(client.initiator).toBe(USER);
    });

    // All of OpenChat's tokens are signed with the same key
    test("refuses a token for another purpose", () => {
        for (const claimType of ["StartVideoCall", "MiniAppPost", "MiniAppBot"]) {
            expect(() => factory().createClientFromCommandJwt(commandToken(claimType))).toThrow(
                BadRequestError,
            );
        }
    });
});

describe("BotClientFactory.botId", () => {
    test("is looked up when first asked for, kept, and looked up again after a failure", async () => {
        const lookup = vi
            .spyOn(GlobalClient.prototype, "botId")
            .mockRejectedValueOnce(new Error("BotNotFound"))
            .mockResolvedValue(BOT_ID);
        const bot = factory();

        expect(lookup).not.toHaveBeenCalled();
        await expect(bot.botId()).rejects.toThrow("BotNotFound");
        expect(await bot.botId()).toBe(BOT_ID);
        expect(await bot.botId()).toBe(BOT_ID);
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    test("asks the UserIndex for none of the bot's installation events", async () => {
        const query = vi
            .spyOn(
                GlobalClient.prototype as unknown as {
                    executeMsgpackQuery: (...args: unknown[]) => Promise<unknown>;
                },
                "executeMsgpackQuery",
            )
            .mockResolvedValue({ kind: "success", botId: BOT_ID, events: [] });

        expect(await factory().botId()).toBe(BOT_ID);
        expect(query).toHaveBeenCalledWith(
            "bot_installation_events",
            { from: 0, size: 0 },
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });
});

describe("BotClientFactory.createMiniAppServiceClient", () => {
    function stubQuery(response: unknown) {
        return vi
            .spyOn(
                BotGatewayClient.prototype as unknown as {
                    executeMsgpackQuery: (...args: unknown[]) => Promise<unknown>;
                },
                "executeMsgpackQuery",
            )
            .mockImplementation((_method, _args, mapper) =>
                Promise.resolve((mapper as (resp: unknown) => unknown)(response)),
            );
    }

    test("calls the service with the bot token from the LocalUserIndex", async () => {
        const query = stubQuery({ Success: "bot.token" });
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(`{"game":${GAME_JSON}}`, { status: 200 }));

        await factory()
            .createMiniAppServiceClient("https://mini-apps.example.com/", API_GATEWAY)
            .post(postToken(), {
                text: "**Uno**",
                app: "uno",
                spectators: false,
                appSize: { width: 440, height: 740 },
            });

        expect(query).toHaveBeenCalledWith(
            "bot_mini_app_token",
            {},
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://mini-apps.example.com/bot/post");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer bot.token");
    });

    test("fails if the LocalUserIndex refuses the bot a token", async () => {
        stubQuery("NotAuthorized");

        await expect(
            new BotGatewayClient(API_GATEWAY, {} as never, {} as never).miniAppBotToken(),
        ).rejects.toThrow("NotAuthorized");
    });
});
