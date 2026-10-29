import jwt from "jsonwebtoken";
import type { MiniAppGame, MiniAppGameUpdate } from "../../domain/mini_app";
import { apiMiniAppGameUpdate, miniAppGame, type ApiMiniAppGame } from "../../mapping";

// A bot token lasts an hour, and is fetched again this long before it expires
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

/** What went wrong with a call to the MiniApp service, by the status it answered with */
export type MiniAppServiceErrorKind =
    // 400: eg. a status moving back, a result without "finished", or waiting for someone who isn't
    // playing, or an invalid registration. Or 415 or 422: a body the service can't read.
    | "invalid"
    // 401: the bot token was refused, even after fetching a new one
    | "unauthorized"
    // 403: the game is another bot's
    | "not_bots_game"
    // 404: the service doesn't know the game, eg. as it was never registered
    | "unknown_game"
    // 409: the game has finished, so it never changes
    | "finished"
    // 413: the update is over 64 KB
    | "too_large"
    // Anything else, eg. the service couldn't read or save the game, or couldn't be reached, so
    // try again
    | "unavailable";

export class MiniAppServiceError extends Error {
    constructor(
        public readonly kind: MiniAppServiceErrorKind,
        /** The HTTP status the service answered with, or 0 if it couldn't be reached */
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "MiniAppServiceError";
    }
}

/**
 * A client for OpenChat's MiniApp service's bot API: registering the games the bot posts, and
 * updating them. Every call carries the bot's token, from a LocalUserIndex's `bot_mini_app_token`,
 * which it keeps for its hour, fetching a new one shortly before it expires, or when the service
 * refuses it. Make one with `BotClientFactory.createMiniAppServiceClient`, and keep it.
 */
export class MiniAppServiceClient {
    #url: string;
    #getBotToken: () => Promise<string>;
    #fetch: typeof fetch;
    #botToken?: { token: string; refreshAt: number };
    #fetchingBotToken?: Promise<string>;
    #publicKey?: Promise<string>;

    constructor(
        /** The service's URL, eg. "https://mini-apps.example.com" */
        url: string,
        /** Fetches a new bot token */
        getBotToken: () => Promise<string>,
        options: { fetch?: typeof fetch } = {},
    ) {
        this.#url = url.replace(/\/+$/, "");
        this.#getBotToken = getBotToken;
        this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    }

    /**
     * Registers a game the bot has just posted, with the `miniAppRegistration` sending its card
     * gave, so that people can join it. Registering a game again does nothing. Resolves with the
     * game, as the registration names it.
     */
    async register(registration: string): Promise<MiniAppGame> {
        const game = registrationGame(registration);
        await this.#call("/bot/register", { registration });
        return game;
    }

    /**
     * Updates one of the bot's games: whose turn it is, its players (only to take some off) and its
     * state, or ends it, with its result. The service writes the card and relays the state. A
     * player starts a game, which the bot answers at `POST <endpoint>/mini_app/start`.
     */
    async update(update: MiniAppGameUpdate): Promise<void> {
        await this.#call("/bot/update", apiMiniAppGameUpdate(update));
    }

    /**
     * The service's public key, a PEM, which its tokens are verified with by `MiniAppTokens`. It's
     * fetched when first asked for and kept, or fetched again after a failure.
     */
    publicKey(): Promise<string> {
        if (this.#publicKey === undefined) {
            const fetching = this.#send(`${this.#url}/public_key`).then(async (response) => {
                if (!response.ok) {
                    throw await serviceError(response);
                }
                return response.text();
            });
            this.#publicKey = fetching;
            fetching.catch(() => {
                if (this.#publicKey === fetching) {
                    this.#publicKey = undefined;
                }
            });
        }
        return this.#publicKey;
    }

    async #call(path: string, body: unknown): Promise<void> {
        const json = JSON.stringify(body);
        const token = await this.#token();
        let response = await this.#post(path, json, token);
        if (response.status === 401) {
            // eg. as the token expired early, by the service's clock
            response = await this.#post(path, json, await this.#token(token));
        }
        if (!response.ok) {
            throw await serviceError(response);
        }
    }

    #post(path: string, body: string, token: string): Promise<Response> {
        return this.#send(`${this.#url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body,
        });
    }

    // So that every error is a MiniAppServiceError, a network failure too
    async #send(url: string, init?: RequestInit): Promise<Response> {
        try {
            return await this.#fetch(url, init);
        } catch (err) {
            throw new MiniAppServiceError(
                "unavailable",
                0,
                `The service couldn't be reached: ${err}`,
            );
        }
    }

    // The bot token, fetched again if it's about to expire or the service refused it. Calls made
    // while one is being fetched share it.
    #token(refused?: string): Promise<string> {
        const current = this.#botToken;
        if (current !== undefined && current.token !== refused && Date.now() < current.refreshAt) {
            return Promise.resolve(current.token);
        }
        if (this.#fetchingBotToken === undefined) {
            this.#fetchingBotToken = this.#getBotToken()
                .then((token) => {
                    this.#botToken = { token, refreshAt: refreshAt(token) };
                    return token;
                })
                .finally(() => (this.#fetchingBotToken = undefined));
        }
        return this.#fetchingBotToken;
    }
}

// When to fetch a new bot token, which is read only for its expiry: the service verifies it
function refreshAt(token: string): number {
    const claims = jwt.decode(token);
    const exp = typeof claims === "object" ? claims?.exp : undefined;
    return exp === undefined ? 0 : exp * 1000 - REFRESH_BEFORE_EXPIRY_MS;
}

// The game a registration names. The service verifies the registration.
function registrationGame(registration: string): MiniAppGame {
    try {
        const claims = jwt.decode(registration) as { game: ApiMiniAppGame };
        return miniAppGame(claims.game);
    } catch (err) {
        throw new Error(`Not a MiniApp registration: ${err}`);
    }
}

async function serviceError(response: Response): Promise<MiniAppServiceError> {
    const body = await response.text().catch(() => "");
    let message = body || response.statusText || `Status ${response.status}`;
    try {
        const error = (JSON.parse(body) as { error?: unknown }).error;
        if (typeof error === "string") {
            message = error;
        }
    } catch {
        // Not the service's JSON, eg. from a proxy in front of it
    }
    return new MiniAppServiceError(errorKind(response.status), response.status, message);
}

function errorKind(status: number): MiniAppServiceErrorKind {
    switch (status) {
        case 400:
        case 415:
        case 422:
            return "invalid";
        case 401:
            return "unauthorized";
        case 403:
            return "not_bots_game";
        case 404:
            return "unknown_game";
        case 409:
            return "finished";
        case 413:
            return "too_large";
        default:
            return "unavailable";
    }
}
