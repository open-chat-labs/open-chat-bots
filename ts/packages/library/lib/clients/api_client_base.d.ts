import { HttpAgent } from "@dfinity/agent";
import type { BotActionScope, BotClientConfig, Message } from "../types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { BotClientBase } from "./client_base";
export declare class ApiKeyBotClientBase extends BotClientBase {
    #private;
    protected apiKey: string;
    constructor(agent: HttpAgent, env: BotClientConfig, apiKey: string);
    get scope(): BotActionScope;
    isChatScope(): boolean;
    isCommunityScope(): boolean;
    get botId(): string;
    sendMessage(message: Message): Promise<BotSendMessageResponse>;
}
