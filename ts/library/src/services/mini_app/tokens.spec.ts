import { describe, expect, test } from "vitest";
import { ChannelIdentifier, GroupChatIdentifier } from "../../domain/identifiers";
import {
    BOT_ID,
    COMMUNITY,
    GROUP,
    NOW,
    OTHER_BOT,
    USER,
    otherSigningKey,
    playerToken,
    publicKeyPem,
} from "../../utils/test_tokens";
import { MiniAppTokens, TokenError } from "./tokens";

const tokens = new MiniAppTokens(publicKeyPem(), BOT_ID);

const GAME = {
    chat: new ChannelIdentifier(COMMUNITY, 7n),
    thread: 3,
    messageId: 18446744073709551615n,
};

// Each of the service's tokens, and what verifies it
const KINDS = [
    ["MiniAppPlayer", (header: string) => tokens.verifyPlayer(header, NOW)],
    ["MiniAppJoin", (header: string) => tokens.verifyJoin(header, NOW)],
    ["MiniAppLeave", (header: string) => tokens.verifyLeave(header, NOW)],
    ["MiniAppStart", (header: string) => tokens.verifyStart(header, NOW)],
] as const;

function refused(verify: () => unknown): TokenError {
    try {
        verify();
    } catch (err) {
        expect(err).toBeInstanceOf(TokenError);
        return err as TokenError;
    }
    throw new Error("The token was taken");
}

describe("MiniAppTokens", () => {
    test.each(KINDS)("takes a %s token, with its game, user and bot", (claimType, verify) => {
        expect(verify(playerToken({ claimType }))).toEqual({
            bot: BOT_ID,
            game: GAME,
            userId: USER,
        });
    });

    test("reads a group's game, outside a thread", () => {
        const game = `{"chat":{"Group":"${GROUP}"},"thread":null,"message_id":"5"}`;

        expect(tokens.verifyPlayer(playerToken({ game }), NOW).game).toEqual({
            chat: new GroupChatIdentifier(GROUP),
            thread: undefined,
            messageId: 5n,
        });
    });

    test.each(KINDS)("refuses an expired %s token as expired", (claimType, verify) => {
        const error = refused(() => verify(playerToken({ claimType, expSeconds: NOW / 1000 })));

        expect(error.kind).toBe("expired");
    });

    test.each(KINDS)("refuses a %s token for another bot", (claimType, verify) => {
        const error = refused(() => verify(playerToken({ claimType, bot: OTHER_BOT })));

        expect(error.kind).toBe("invalid");
        expect(error.message).toContain(OTHER_BOT);
    });

    // As the service signs them all with the same key
    test.each(KINDS)("refuses another claim type for a %s token", (claimType, verify) => {
        for (const other of [
            "MiniAppPlayer",
            "MiniAppJoin",
            "MiniAppLeave",
            "MiniAppStart",
            "MiniAppBot",
        ]) {
            if (other === claimType) continue;
            const error = refused(() => verify(playerToken({ claimType: other })));

            expect(error.kind).toBe("invalid");
            expect(error.message).toBe(`Expected a ${claimType} token, got ${other}`);
        }
    });

    // A user asking to join mustn't be taken as a player asking to start, nor the other way round
    test("refuses a join token as a start, and a start token as a join", () => {
        const join = playerToken({ claimType: "MiniAppJoin" });
        const start = playerToken({ claimType: "MiniAppStart" });

        expect(refused(() => tokens.verifyStart(join, NOW)).message).toBe(
            "Expected a MiniAppStart token, got MiniAppJoin",
        );
        expect(refused(() => tokens.verifyJoin(start, NOW)).message).toBe(
            "Expected a MiniAppJoin token, got MiniAppStart",
        );
        expect(tokens.verifyStart(start, NOW).userId).toBe(USER);
    });

    test.each(KINDS)("refuses a %s token signed with another key", (claimType, verify) => {
        const error = refused(() => verify(playerToken({ claimType }, otherSigningKey)));

        expect(error.kind).toBe("invalid");
    });

    test("refuses a token for another bot as invalid, even once it's expired", () => {
        const token = playerToken({ bot: OTHER_BOT, expSeconds: NOW / 1000 - 60 });

        expect(refused(() => tokens.verifyPlayer(token, NOW)).kind).toBe("invalid");
    });

    test("refuses a missing header, or several", () => {
        for (const header of [undefined, null, "", [playerToken(), playerToken()]]) {
            expect(refused(() => tokens.verifyPlayer(header, NOW)).kind).toBe("invalid");
        }
    });

    test("refuses a token whose game can't be read", () => {
        const token = playerToken({ game: `{"chat":{"Group":"${GROUP}"},"message_id":"x"}` });

        expect(refused(() => tokens.verifyPlayer(token, NOW)).kind).toBe("invalid");
    });

    test("takes a public key whose newlines are escaped, as in an env file", () => {
        const escaped = new MiniAppTokens(publicKeyPem().replace(/\n/g, "\\n"), BOT_ID);

        expect(escaped.verifyPlayer(playerToken(), NOW).userId).toBe(USER);
    });
});
