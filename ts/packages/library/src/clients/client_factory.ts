import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import type { BotClientConfig } from "../types";
import { ApiKeyBotChatClient } from "./api_chat_client";
import { ApiKeyBotCommunityClient } from "./api_community_client";
import { CommandBotChatClient } from "./command_chat_client";

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

    createApiKeyChatClient(apiKey: string): ApiKeyBotChatClient {
        return new ApiKeyBotChatClient(this.#agent, this.env, apiKey);
    }

    createApiKeyCommunityClient(apiKey: string): ApiKeyBotCommunityClient {
        return new ApiKeyBotCommunityClient(this.#agent, this.env, apiKey);
    }

    createCommandChatClient(encodedJwt: string): CommandBotChatClient {
        return new CommandBotChatClient(this.#agent, this.env, encodedJwt);
    }

    createCommandCommunityClient(encodedJwt: string): CommandBotChatClient {
        return new CommandBotChatClient(this.#agent, this.env, encodedJwt);
    }
}
