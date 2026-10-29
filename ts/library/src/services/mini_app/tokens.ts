import jwt from "jsonwebtoken";
import type { MiniAppPlayerClaims } from "../../domain/mini_app";
import { miniAppGame, type ApiMiniAppGame } from "../../mapping";

// The `claim_type`s of the tokens the MiniApp service signs, with its own key
export const CLAIM_TYPE_MINI_APP_PLAYER = "MiniAppPlayer";
export const CLAIM_TYPE_MINI_APP_JOIN = "MiniAppJoin";
export const CLAIM_TYPE_MINI_APP_LEAVE = "MiniAppLeave";
export const CLAIM_TYPE_MINI_APP_START = "MiniAppStart";

/** The header the service's calls, and a player's app, send their token in */
export const MINI_APP_TOKEN_HEADER = "x-oc-jwt";

// The claims of the service's tokens, as it writes them in JSON
type RawMiniAppPlayerJwt = {
    exp: number;
    claim_type: string;
    bot: string;
    game: ApiMiniAppGame;
    user_id: string;
};

/**
 * Why a token was refused. `expired` means it was valid until it ran out, and `invalid` anything
 * else, eg. a missing token, a bad signature, another kind of token, or a token for another bot.
 * Answer either with a 401.
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

/** A header's value, as Node's `req.headers[name]` or fetch's `headers.get(name)` gives it */
export type MiniAppTokenHeader = string | string[] | null | undefined;

/**
 * Verifies the tokens the MiniApp service signs, with its public key, from
 * `MiniAppServiceClient.publicKey()`. Each method takes the `x-oc-jwt` header's value and gives
 * what the token says, or throws a `TokenError`. It checks, in order:
 * 1. that the service signed it;
 * 2. that it's the kind of token expected, as the service signs them all with the same key;
 * 3. that it's for this bot, `botId`, as otherwise one bot's server could pass a token to another;
 * 4. that it hasn't expired.
 *
 * `botId` is the user id OpenChat gave the bot when it was registered, which isn't its principal.
 * `BotClientFactory.botId()` fetches it, once OpenChat has registered the bot, so make this on
 * first use rather than at startup.
 */
export class MiniAppTokens {
    #publicKey: string;

    constructor(
        publicKey: string,
        public readonly botId: string,
    ) {
        this.#publicKey = publicKey.replace(/\\n/g, "\n");
    }

    /**
     * A player's token, which their app sends with each request to the bot. It lasts an hour, and
     * outlives the player being removed, so check the bot's own player list too.
     */
    verifyPlayer(header: MiniAppTokenHeader, now: number = Date.now()): MiniAppPlayerClaims {
        return this.#verify(header, CLAIM_TYPE_MINI_APP_PLAYER, now);
    }

    /**
     * The service's `POST <endpoint>/mini_app/join`: a user asks to join a game, which the bot
     * answers with a `MiniAppJoinResponse` within 5 seconds. They aren't playing until the service
     * adds them, after the answer, so don't count them as a player until the bot's asked to start.
     */
    verifyJoin(header: MiniAppTokenHeader, now: number = Date.now()): MiniAppPlayerClaims {
        return this.#verify(header, CLAIM_TYPE_MINI_APP_JOIN, now);
    }

    /**
     * The service's `POST <endpoint>/mini_app/start`: a player asks to start a game, which the bot
     * answers within 5 seconds with `acceptMiniAppStart`, with the game's first state, or
     * `refuseMiniAppStart`
     */
    verifyStart(header: MiniAppTokenHeader, now: number = Date.now()): MiniAppPlayerClaims {
        return this.#verify(header, CLAIM_TYPE_MINI_APP_START, now);
    }

    /**
     * The service's `POST <endpoint>/mini_app/leave`: a player left a game, or isn't playing after
     * all, eg. as the bot accepted them too late. The bot answers 200, even for a user who isn't
     * one of its players, as the service retries otherwise.
     */
    verifyLeave(header: MiniAppTokenHeader, now: number = Date.now()): MiniAppPlayerClaims {
        return this.#verify(header, CLAIM_TYPE_MINI_APP_LEAVE, now);
    }

    #verify(header: MiniAppTokenHeader, claimType: string, now: number): MiniAppPlayerClaims {
        if (typeof header !== "string" || header === "") {
            throw new TokenError(
                "invalid",
                `Expected a token in the ${MINI_APP_TOKEN_HEADER} header`,
            );
        }
        let decoded: string | jwt.JwtPayload;
        try {
            // Expiry is checked last, below, so that a token for another bot is refused as invalid
            // even once it's expired, as it'll never be valid here
            decoded = jwt.verify(header, this.#publicKey, {
                algorithms: ["ES256"],
                ignoreExpiration: true,
            });
        } catch (err) {
            throw new TokenError("invalid", `Token invalid: ${err}`);
        }
        if (typeof decoded === "string") {
            throw new TokenError("invalid", "Token invalid: its claims aren't an object");
        }

        const claims = decoded as unknown as RawMiniAppPlayerJwt;
        if (claims.claim_type !== claimType) {
            throw new TokenError(
                "invalid",
                `Expected a ${claimType} token, got ${claims.claim_type}`,
            );
        }
        if (claims.bot !== this.botId) {
            throw new TokenError(
                "invalid",
                `The token is for the bot ${claims.bot}, not this one, ${this.botId}`,
            );
        }

        let verified: MiniAppPlayerClaims;
        try {
            if (typeof claims.exp !== "number" || typeof claims.user_id !== "string") {
                throw new Error("exp or user_id is missing");
            }
            verified = { bot: claims.bot, game: miniAppGame(claims.game), userId: claims.user_id };
        } catch (err) {
            throw new TokenError("invalid", `Token invalid: ${err}`);
        }

        if (claims.exp * 1000 <= now) {
            throw new TokenError("expired", "Token expired");
        }
        return verified;
    }
}
