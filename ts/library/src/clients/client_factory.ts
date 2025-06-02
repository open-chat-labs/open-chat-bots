import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import jwt from "jsonwebtoken";
import type { ActionScope, BotClientConfig, RawCommandJwt } from "../domain";
import { ActionContext } from "../domain/action_context";
import { Permissions } from "../domain/permissions";
import { BadRequestError } from "../utils/badrequest";
import { BotClient } from "./bot_client";

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
    #env: BotClientConfig;

    constructor(private env: BotClientConfig) {
        this.#env = this.#validateConfig(env);
        this.#agent = createAgent(env);
    }

    #validateConfig(env: BotClientConfig): BotClientConfig {
        if (env.icHost === undefined) {
            throw new Error("IC Host not provided");
        } else if (env.identityPrivateKey === undefined) {
            throw new Error("Identity private key not provided");
        } else if (env.openStorageCanisterId === undefined) {
            throw new Error("OpenStorage index canister not provided");
        } else if (env.openchatPublicKey === undefined) {
            throw new Error("OpenChat public key not provided");
        }
        return env;
    }

    createClientInAutonomouseContext(
        scope: ActionScope,
        apiGateway: string,
        autonomousPermissions: Permissions = new Permissions({
            chat: 0,
            community: 0,
            message: 0,
        }),
    ): BotClient {
        return new BotClient(
            this.#agent,
            this.env,
            ActionContext.inAutonomousContext(scope, apiGateway, autonomousPermissions),
        );
    }

    createClientFromCommandJwt(token: string): BotClient {
        const publicKey = this.#env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                const actionContext = ActionContext.fromCommand(token, decoded as RawCommandJwt);
                return new BotClient(this.#agent, this.env, actionContext);
            } else {
                console.error(`Unable to decode jwt`, token);
                throw new BadRequestError("AccessTokenInvalid");
            }
        } catch (err) {
            console.error(`Unable to decode jwt`, err, token);
            throw new BadRequestError("AccessTokenInvalid");
        }
    }
}
