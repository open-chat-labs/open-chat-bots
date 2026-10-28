import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BadRequestError } from "../utils/badrequest";
import {
    API_GATEWAY,
    BOT_ID,
    GROUP,
    USER,
    publicKeyPem,
    sessionToken,
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
        for (const token of [commandToken("StartVideoCall"), sessionToken()]) {
            expect(() => factory().createClientFromCommandJwt(token)).toThrow(BadRequestError);
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
