import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import type { BotActionScope, BotClientConfig } from "../types";
import { BotApiKeyChatClient } from "./api_chat_client";
import { BotApiKeyCommunityClient } from "./api_community_client";
import { BotCommandChatClient } from "./command_chat_client";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";

function createAgent(env: BotClientConfig): HttpAgent {
    const identity = createIdentity(env.identityPrivateKey);
    console.log("Principal: ", identity.getPrincipal().toText());
    return new HttpAgent({
        identity,
        host: env.icHost,
        retryTimes: 5,
    });
}

function createIdentity(privateKey: string) {
    const privateKeyPem = privateKey.replace(/\\n/g, "\n");
    try {
        return Secp256k1KeyIdentity.fromPem(privateKeyPem);
    } catch (err) {
        console.error("Unable to create identity from private key", err);
        throw err;
    }
}

type ApiKey = {
    gateway: string;
    bot_id: string;
    scope: BotActionScope;
    secret: string;
};

function decodeApiKey(apiKey: string): ApiKey {
    const buffer = Buffer.from(apiKey, "base64");
    const decoded = buffer.toString("utf-8");
    return JSON.parse(decoded) as ApiKey;
}

export class BotClientFactory {
    #agent: HttpAgent;

    constructor(private env: BotClientConfig) {
        this.#validateConfig(env);
        this.#agent = createAgent(env);
    }

    #validateConfig(env: BotClientConfig) {
        if (env.icHost === undefined) {
            throw new Error("IC Host not provided");
        } else if (env.identityPrivateKey === undefined) {
            throw new Error("Identity private key not provided");
        } else if (env.openStorageCanisterId === undefined) {
            throw new Error("OpenStorage index canister not provided");
        } else if (env.openchatPublicKey === undefined) {
            throw new Error("OpenChat public key not provided");
        }
    }

    #getAuthToken(apiKey: string): Promise<string> {
        const key = decodeApiKey(apiKey);
        const botService = new BotGatewayClient(key.gateway, this.#agent, this.env);
        return botService.getAuthToken(apiKey);
    }

    createApiKeyChatClient(apiKey: string): Promise<BotApiKeyChatClient> {
        return this.#getAuthToken(apiKey).then(
            (token) => new BotApiKeyChatClient(this.#agent, this.env, token),
        );
    }

    createApiKeyCommunityClient(apiKey: string): Promise<BotApiKeyCommunityClient> {
        return this.#getAuthToken(apiKey).then(
            (token) => new BotApiKeyCommunityClient(this.#agent, this.env, token),
        );
    }

    createCommandChatClient(encodedJwt: string): BotCommandChatClient {
        return new BotCommandChatClient(this.#agent, this.env, encodedJwt);
    }

    createCommandCommunityClient(encodedJwt: string): BotCommandChatClient {
        return new BotCommandChatClient(this.#agent, this.env, encodedJwt);
    }
}
