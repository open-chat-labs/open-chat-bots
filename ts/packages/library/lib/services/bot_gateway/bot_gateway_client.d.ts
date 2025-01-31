import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import type { ExecuteBotCommandResponse } from "./candid/types";
import type { BotAction, BotClientConfig } from "../../types";
export declare class BotGatewayClient extends CandidService {
    #private;
    protected env: BotClientConfig;
    constructor(canisterId: string, agent: HttpAgent, env: BotClientConfig);
    executeAction(action: BotAction, jwt: string): Promise<ExecuteBotCommandResponse>;
    getAuthToken(apiKey: string): Promise<string>;
}
