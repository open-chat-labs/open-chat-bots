import type { BotClientConfig } from "../types";
import { BotClient } from "./bot_client";
export declare class BotClientFactory {
    #private;
    private env;
    constructor(env: BotClientConfig);
    createClientFromApiKey(apiKey: string): BotClient;
    createClientFromJwt(jwt: string): BotClient;
}
