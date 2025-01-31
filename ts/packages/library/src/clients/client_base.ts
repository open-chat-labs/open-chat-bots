import { HttpAgent } from "@dfinity/agent";
import jwt from "jsonwebtoken";
import { CandidService } from "../utils/candidService";
import type { BotAction, BotActionScope, BotClientConfig, DecodedJwt } from "../types";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import { BadRequestError } from "../utils/badrequest";
import type { ExecuteBotCommandResponse } from "../services/bot_gateway/candid/types";

export class BotClientBase extends CandidService {
    protected decodedJwt: DecodedJwt;
    #encodedJwt: string;
    #botService: BotGatewayClient;

    constructor(
        agent: HttpAgent,
        protected env: BotClientConfig,
        encodedJwt: string,
    ) {
        super();
        this.#encodedJwt = encodedJwt;
        this.decodedJwt = this.#decodeJwt(encodedJwt);
        this.#botService = new BotGatewayClient(this.decodedJwt.bot_api_gateway, agent, env);
    }

    #decodeJwt(token: string): DecodedJwt {
        const publicKey = this.env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                return decoded as DecodedJwt;
            } else {
                console.error(`Unable to decode jwt`, token);
                throw new BadRequestError("AccessTokenInvalid");
            }
        } catch (err) {
            console.error(`Unable to decode jwt`, err, token);
            throw new BadRequestError("AccessTokenInvalid");
        }
    }

    public get scope(): BotActionScope {
        return this.decodedJwt.scope;
    }

    public isChatScope(): boolean {
        return "Chat" in this.scope;
    }

    public isCommunityScope(): boolean {
        return "Community" in this.scope;
    }

    public get botId(): string {
        return this.decodedJwt.bot;
    }

    protected executeAction(action: BotAction): Promise<ExecuteBotCommandResponse> {
        return this.#botService.executeAction(action, this.#encodedJwt);
    }
}
