import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import type { BotClientConfig } from "../types";
import { BotClient } from "./bot_client";

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

    createClientFromApiKey(apiKey: string): BotClient {
        return new BotClient(this.#agent, this.env, { kind: "api_key", token: apiKey });
    }

    createClientFromJwt(jwt: string): BotClient {
        return new BotClient(this.#agent, this.env, { kind: "jwt", token: jwt });
    }
}
