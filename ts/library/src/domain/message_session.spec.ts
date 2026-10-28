import { describe, expect, test } from "vitest";
import {
    API_GATEWAY,
    BOT_ID,
    COMMUNITY,
    GROUP,
    NOW,
    OTHER_BOT,
    USER,
    otherSigningKey,
    publicKeyPem,
    sessionClaimsJson,
    sessionToken,
    sign,
} from "../utils/test_tokens";
import { ChannelIdentifier, GroupChatIdentifier } from "./identifiers";
import { BotMessageSession, TokenError, messageKey } from "./message_session";

function parse(token: string): BotMessageSession {
    return BotMessageSession.parse(token, publicKeyPem(), BOT_ID, NOW);
}

function refusal(token: string): TokenError {
    try {
        parse(token);
    } catch (err) {
        expect(err).toBeInstanceOf(TokenError);
        return err as TokenError;
    }
    throw new Error("Expected the token to be refused");
}

describe("BotMessageSession.parse", () => {
    test("parses a token OpenChat signed for the bot", () => {
        const session = parse(sessionToken());

        expect(session.botId).toBe(BOT_ID);
        expect(session.apiGateway).toBe(API_GATEWAY);
        expect(session.chat).toEqual(new ChannelIdentifier(COMMUNITY, 7n));
        expect(session.thread).toBe(3);
        expect(session.messageId).toBe(18446744073709551615n);
        expect(session.userId).toBe(USER);
        expect(session.timezone).toBe("Europe/London");
        expect(session.language).toBe("fr");
        expect(session.scope.isChatScope() && session.scope.chat).toEqual(session.chat);
    });

    test("parses a token without a thread or meta", () => {
        const session = parse(
            sessionToken({
                chat: `{"Group":"${GROUP}"}`,
                thread: null,
                messageId: "5",
                meta: "null",
            }),
        );

        expect(session.chat).toEqual(new GroupChatIdentifier(GROUP));
        expect(session.thread).toBeUndefined();
        expect(session.messageId).toBe(5n);
        expect(session.timezone).toBe("UTC");
        expect(session.language).toBe("en");
    });

    test("accepts the public key with escaped newlines, as bots keep it in env vars", () => {
        const escaped = publicKeyPem().replace(/\n/g, "\\n");

        expect(BotMessageSession.parse(sessionToken(), escaped, BOT_ID, NOW).userId).toBe(USER);
    });

    test("refuses an expired token as expired", () => {
        expect(refusal(sessionToken({ expSeconds: NOW / 1000 })).kind).toBe("expired");
        expect(parse(sessionToken({ expSeconds: NOW / 1000 + 1 })).userId).toBe(USER);
    });

    test("refuses a token for another bot, even once it's expired", () => {
        for (const expSeconds of [NOW / 1000 + 900, NOW / 1000 - 1]) {
            expect(refusal(sessionToken({ bot: OTHER_BOT, expSeconds })).kind).toBe("invalid");
        }
    });

    // The bot's id in its tokens is the user id OpenChat gave it, not the principal it calls with
    test("refuses a token checked against the bot's principal", () => {
        const principal = "2vxsx-fae";

        expect(() =>
            BotMessageSession.parse(sessionToken(), publicKeyPem(), principal, NOW),
        ).toThrow(TokenError);
    });

    test("refuses a token of another type", () => {
        for (const claimType of ["BotActionByCommand", "StartVideoCall"]) {
            expect(refusal(sessionToken({ claimType })).kind).toBe("invalid");
        }
    });

    test("refuses a token signed with another key", () => {
        expect(refusal(sign(sessionClaimsJson(), otherSigningKey)).kind).toBe("invalid");
    });

    test("refuses a token whose claims were changed", () => {
        const [header, , signature] = sessionToken().split(".");
        const [, otherClaims] = sessionToken({ expSeconds: NOW / 1000 + 7200 }).split(".");

        expect(refusal(`${header}.${otherClaims}.${signature}`).kind).toBe("invalid");
    });

    test("refuses a malformed token", () => {
        for (const token of ["", "a.b", "a.b.c"]) {
            expect(refusal(token).kind).toBe("invalid");
        }
    });

    test("refuses a token missing its claims", () => {
        const claims = JSON.parse(sessionClaimsJson());
        for (const missing of ["exp", "chat", "message_id", "user_id", "bot_api_gateway"]) {
            const without = { ...claims };
            delete without[missing];
            expect(refusal(sign(JSON.stringify(without))).kind).toBe("invalid");
        }
    });
});

describe("messageKey", () => {
    test("differs by chat, thread and message id", () => {
        const group = new GroupChatIdentifier(GROUP);
        const keys = [
            messageKey(group, undefined, 1n),
            messageKey(group, 2, 1n),
            messageKey(group, undefined, 2n),
            messageKey(new GroupChatIdentifier(COMMUNITY), undefined, 1n),
            messageKey(new ChannelIdentifier(COMMUNITY, 1n), undefined, 1n),
            messageKey(new ChannelIdentifier(COMMUNITY, 2n), undefined, 1n),
        ];

        expect(new Set(keys).size).toBe(keys.length);
        // A command's message id can be a string at runtime, as it's read from JSON
        expect(messageKey(group, null, "1")).toBe(messageKey(group, undefined, 1n));
    });

    test("is the session's message's", () => {
        const session = parse(sessionToken());

        expect(session.messageKey).toBe(
            messageKey(new ChannelIdentifier(COMMUNITY, 7n), 3, 18446744073709551615n),
        );
    });
});
