import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../utils/candidService";
import type { AuthToken, BotClientConfig, Message } from "../types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
export declare class BotClientBase extends CandidService {
    #private;
    protected agent: HttpAgent;
    protected env: BotClientConfig;
    constructor(agent: HttpAgent, env: BotClientConfig);
    protected createBotService(canisterId: string): void;
    protected sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse>;
}
