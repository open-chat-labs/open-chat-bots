import { BotClient } from "./bot_client";
import type { BotClientConfig } from "../domain";
export declare class BotClientFactory {
    #private;
    private env;
    constructor(env: BotClientConfig);
    createClientFromApiKey(apiKey: string): BotClient;
    createClientFromJwt(jwt: string): BotClient;
}
