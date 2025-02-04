import type { BotClientConfig } from "../types";
import { ApiKeyBotChatClient } from "./api_chat_client";
import { ApiKeyBotCommunityClient } from "./api_community_client";
import { CommandBotChatClient } from "./command_chat_client";
export declare class BotClientFactory {
    #private;
    private env;
    constructor(env: BotClientConfig);
    createApiKeyChatClient(apiKey: string): ApiKeyBotChatClient;
    createApiKeyCommunityClient(apiKey: string): ApiKeyBotCommunityClient;
    createCommandChatClient(encodedJwt: string): CommandBotChatClient;
    createCommandCommunityClient(encodedJwt: string): CommandBotChatClient;
}
