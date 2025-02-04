import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import type { BotSendMessageResponse } from "./candid/types";
import type { AuthToken, BotClientConfig, Message } from "../../types";
export declare class BotGatewayClient extends CandidService {
    #private;
    protected env: BotClientConfig;
    constructor(canisterId: string, agent: HttpAgent, env: BotClientConfig);
    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse>;
}
