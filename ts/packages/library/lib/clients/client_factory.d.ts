import type { BotClientConfig } from "../types";
import { BotApiKeyChatClient } from "./api_chat_client";
import { BotApiKeyCommunityClient } from "./api_community_client";
import { BotCommandChatClient } from "./command_chat_client";
export declare class BotClientFactory {
    #private;
    private env;
    constructor(env: BotClientConfig);
    createApiKeyChatClient(apiKey: string): Promise<BotApiKeyChatClient>;
    createApiKeyCommunityClient(apiKey: string): Promise<BotApiKeyCommunityClient>;
    createCommandChatClient(encodedJwt: string): BotCommandChatClient;
    createCommandCommunityClient(encodedJwt: string): BotCommandChatClient;
}
