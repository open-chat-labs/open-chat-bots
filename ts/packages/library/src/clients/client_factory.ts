import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import { BotClient } from "./bot_client";
import type { BotClientConfig } from "../domain";

export function isMainnet(icUrl: string): boolean {
    return icUrl.includes("icp-api.io");
}

function createAgent(env: BotClientConfig): HttpAgent {
    const identity = createIdentity(env.identityPrivateKey);
    console.log("Principal: ", identity.getPrincipal().toText());
    const agent = HttpAgent.createSync({
        identity,
        host: env.icHost,
        verifyQuerySignatures: false,
    });
    const fetchRootKey = !isMainnet(env.icHost);
    if (fetchRootKey) {
        agent.fetchRootKey().catch((err) => console.error("Error fetching root key", err));
    }
    return agent;
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

    createClientFromCommandJwt(jwt: string): BotClient {
        return new BotClient(this.#agent, this.env, { kind: "command_jwt", token: jwt });
    }

    createClientFromApiKeyJwt(jwt: string): BotClient {
        return new BotClient(this.#agent, this.env, { kind: "api_jwt", token: jwt });
    }
}
