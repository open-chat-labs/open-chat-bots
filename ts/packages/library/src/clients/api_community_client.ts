import type { HttpAgent } from "@dfinity/agent";
import type { BotClientConfig } from "../types";
import { ApiKeyBotClientBase } from "./api_client_base";

export class ApiKeyBotCommunityClient extends ApiKeyBotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, apiKey: string) {
        super(agent, env, apiKey);
    }
}
