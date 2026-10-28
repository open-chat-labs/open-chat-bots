import jwt from "jsonwebtoken";
import { mapChatIdentifier } from "../mapping";
import type { BotCommandMeta, Chat } from "../typebox/typebox";
import type { ChatIdentifier } from "./identifiers";
import { ChatActionScope } from "./scope";

/** The `claim_type` of the token OpenChat gives a user to act on one of a bot's MiniApp messages */
export const CLAIM_TYPE_BOT_MESSAGE_SESSION = "BotMessageSession";

/**
 * The claims of a `BotMessageSession` token, as OpenChat writes them in JSON: ids as text, the
 * message id as a string, and a missing thread or meta as null
 */
export type RawBotMessageSessionJwt = {
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    chat: Chat;
    thread?: number | null;
    message_id: string | number;
    user_id: string;
    meta?: BotCommandMeta | null;
};

/**
 * Why a token was refused. `expired` means it was valid, so the website will fetch a new one, and
 * `invalid` anything else, eg. a bad signature, another kind of token, or a token for another bot.
 */
export class TokenError extends Error {
    constructor(
        public readonly kind: "expired" | "invalid",
        message: string,
    ) {
        super(message);
        this.name = "TokenError";
    }
}

/**
 * A key for a message which is unique across chats and threads, eg. to keep a game's state by. A
 * message id alone isn't: it's only unique within its chat and thread, and the client which sends a
 * command chooses the id of the message the bot answers it with.
 */
export function messageKey(
    chat: ChatIdentifier,
    thread: number | undefined | null,
    messageId: bigint | string,
): string {
    const chatKey = chat.isChannel()
        ? `channel:${chat.communityId}:${chat.channelId}`
        : `${chat.kind}:${chat.canisterId()}`;
    return `${chatKey}/${thread ?? "-"}/${BigInt(messageId)}`;
}

/**
 * A user acting on one of the bot's MiniApp messages, eg. pressing its buttons, as OpenChat vouches
 * for in the `BotMessageSession` token the website sends with each press. OpenChat gives one to a
 * member of the chat, for one message, and it's valid for 15 minutes. The website reuses it for each
 * press until then, and fetches a new one when the bot answers a press with a 401.
 *
 * OpenChat's bot endpoints don't accept the token, so the bot acts on the message autonomously, eg.
 * with a client from `BotClientFactory.createClientInAutonomouseContext(session.scope,
 * session.apiGateway)`.
 */
export class BotMessageSession {
    constructor(
        /** The user id OpenChat gave the bot when it was registered */
        public readonly botId: string,
        /** The LocalUserIndex which signed the token, through which the bot acts in the chat */
        public readonly apiGateway: string,
        public readonly chat: ChatIdentifier,
        /** The thread the message is in, if any */
        public readonly thread: number | undefined,
        public readonly messageId: bigint,
        /** The user acting on the message */
        public readonly userId: string,
        public readonly meta?: BotCommandMeta,
    ) {}

    /**
     * Verifies a `BotMessageSession` token, checking, in order:
     * 1. that OpenChat signed it, with `publicKey`, as it signs command tokens;
     * 2. that it's a `BotMessageSession` token;
     * 3. that it's for this bot, `botId`, as otherwise one bot's server could replay a user's token
     *    to another bot;
     * 4. that it hasn't expired.
     *
     * `botId` is the user id OpenChat gave the bot when it was registered, which isn't the bot's
     * principal. `BotClientFactory.botId()` fetches it.
     *
     * @throws TokenError, whose `kind` is `expired` for an expired token and `invalid` otherwise
     */
    static parse(
        token: string,
        publicKey: string,
        botId: string,
        now: number = Date.now(),
    ): BotMessageSession {
        let decoded: string | jwt.JwtPayload;
        try {
            // Expiry is checked last, below, so that a token for another bot is refused as invalid
            // even once it's expired, as it'll never be valid here
            decoded = jwt.verify(token, publicKey.replace(/\\n/g, "\n"), {
                algorithms: ["ES256"],
                ignoreExpiration: true,
            });
        } catch (err) {
            throw new TokenError("invalid", `Token invalid: ${err}`);
        }
        if (typeof decoded === "string") {
            throw new TokenError("invalid", "Token invalid: its claims aren't an object");
        }

        const claims = decoded as unknown as RawBotMessageSessionJwt;
        if (claims.claim_type !== CLAIM_TYPE_BOT_MESSAGE_SESSION) {
            throw new TokenError(
                "invalid",
                `Expected a ${CLAIM_TYPE_BOT_MESSAGE_SESSION} token, got ${claims.claim_type}`,
            );
        }
        if (claims.bot !== botId) {
            throw new TokenError(
                "invalid",
                `The token is for the bot ${claims.bot}, not this one, ${botId}`,
            );
        }

        let session: BotMessageSession;
        try {
            if (typeof claims.exp !== "number") {
                throw new Error("exp is missing");
            }
            session = new BotMessageSession(
                claims.bot,
                requireString(claims.bot_api_gateway, "bot_api_gateway"),
                mapChatIdentifier(claims.chat),
                claims.thread ?? undefined,
                BigInt(claims.message_id),
                requireString(claims.user_id, "user_id"),
                claims.meta ?? undefined,
            );
        } catch (err) {
            throw new TokenError("invalid", `Token invalid: ${err}`);
        }

        if (claims.exp * 1000 <= now) {
            throw new TokenError("expired", "Token expired");
        }

        return session;
    }

    /** The message's chat, as the scope of a client acting there autonomously */
    get scope(): ChatActionScope {
        return new ChatActionScope(this.chat);
    }

    /** The message's key, unique across chats and threads. See `messageKey`. */
    get messageKey(): string {
        return messageKey(this.chat, this.thread, this.messageId);
    }

    /** The user's IANA timezone, eg. "Europe/London", or "UTC" if OpenChat didn't give one */
    get timezone(): string {
        return this.meta?.timezone ?? "UTC";
    }

    /** The language the user has chosen in OpenChat, eg. "en", or "en" if OpenChat didn't give one */
    get language(): string {
        return this.meta?.language ?? "en";
    }
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== "string") {
        throw new Error(`${name} is missing`);
    }
    return value;
}
