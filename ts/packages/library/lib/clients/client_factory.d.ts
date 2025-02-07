import { BotClient } from "./bot_client";
import type { BotClientConfig } from "../domain";
export declare function isMainnet(icUrl: string): boolean;
export declare class BotClientFactory {
    #private;
    private env;
    constructor(env: BotClientConfig);
    createClientFromApiKey(apiKey: string): BotClient;
    createClientFromJwt(jwt: string): BotClient;
}
