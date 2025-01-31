import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../utils/candidService";
import type { BotAction, BotActionScope, BotClientConfig, DecodedJwt } from "../types";
import type { ExecuteBotCommandResponse } from "../services/bot_gateway/candid/types";
export declare class BotClientBase extends CandidService {
    #private;
    protected env: BotClientConfig;
    protected decodedJwt: DecodedJwt;
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string);
    get scope(): BotActionScope;
    isChatScope(): boolean;
    isCommunityScope(): boolean;
    get botId(): string;
    protected executeAction(action: BotAction): Promise<ExecuteBotCommandResponse>;
}
