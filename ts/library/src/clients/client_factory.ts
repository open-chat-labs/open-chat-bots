import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import jwt from "jsonwebtoken";
import type { ActionScope, BotClientConfig, RawCommandJwt } from "../domain";
import { ActionContext } from "../domain/action_context";
import { Permissions } from "../domain/permissions";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import { MiniAppServiceClient } from "../services/mini_app";
import { BadRequestError } from "../utils/badrequest";
import { DEFAULT_PREVIEW_PROXY_URL } from "../utils/linkPreviews";
import { BotClient } from "./bot_client";
import { GlobalClient } from "./global_client";

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

// The `claim_type` of a command's token
const CLAIM_TYPE_BOT_ACTION_BY_COMMAND = "BotActionByCommand";

export class BotClientFactory {
    #agent: HttpAgent;
    #env: BotClientConfig;
    #botId?: Promise<string>;

    constructor(env: BotClientConfig) {
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
        return {
            ...env,
            autoFetchOgPreviews: env.autoFetchOgPreviews ?? true,
            previewProxyUrl: env.previewProxyUrl ?? DEFAULT_PREVIEW_PROXY_URL,
        };
    }

    get env(): BotClientConfig {
        return this.#env;
    }

    createClientInAutonomouseContext(
        scope: ActionScope,
        apiGateway: string,
        autonomousPermissions?: Permissions,
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
            // All of OpenChat's tokens are signed with the same key, so a token for another
            // purpose, eg. a MiniApp post token, must not be taken for a command's
            if (
                typeof decoded !== "string" &&
                decoded.claim_type === CLAIM_TYPE_BOT_ACTION_BY_COMMAND
            ) {
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

    createGlobalClient(): GlobalClient {
        return new GlobalClient(this.#agent, this.env);
    }

    /**
     * A client for OpenChat's MiniApp service, at `url`, for the bot's games. It gets the bot's
     * token for the service from the LocalUserIndex `apiGateway`, which can be any of them, as they
     * all know every bot, eg. a command's, `client.apiGateway`, or an installation's. Making it
     * calls nothing, and it fetches the token when it's first used. Keep the client, as it keeps
     * the token for its hour.
     */
    createMiniAppServiceClient(url: string, apiGateway: string): MiniAppServiceClient {
        const gateway = new BotGatewayClient(apiGateway, this.#agent, this.env);
        return new MiniAppServiceClient(url, () => gateway.miniAppBotToken());
    }

    /**
     * The user id OpenChat gave the bot when it was registered, which is the `bot` in its tokens,
     * eg. to verify the MiniApp service's with `MiniAppTokens`. It isn't the bot's principal. It's
     * fetched from the UserIndex when first asked for, rather than at startup, as a bot is usually
     * started before it's registered, and kept once found. A failed lookup is tried again next
     * time. It asks the UserIndex in `userIndexCanisterId`, which defaults to OpenChat's on
     * mainnet, so set that for any other environment.
     */
    botId(): Promise<string> {
        if (this.#botId === undefined) {
            const lookup = this.createGlobalClient().botId();
            this.#botId = lookup;
            lookup.catch(() => {
                if (this.#botId === lookup) {
                    this.#botId = undefined;
                }
            });
        }
        return this.#botId;
    }
}
