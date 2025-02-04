import { HttpAgent } from "@dfinity/agent";
import type { AuthToken, BotActionScope, BotClientConfig, DecodedApiKey, Message } from "../types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { BotClientBase } from "./client_base";

export class ApiKeyBotClientBase extends BotClientBase {
    #decodedApiKey: DecodedApiKey;

    constructor(
        agent: HttpAgent,
        env: BotClientConfig,
        protected apiKey: string,
    ) {
        super(agent, env);
        this.#decodedApiKey = this.#decodeApiKey(apiKey);
        this.createBotService(this.#decodedApiKey.gateway);
    }

    #decodeApiKey(apiKey: string): DecodedApiKey {
        const buffer = Buffer.from(apiKey, "base64");
        const decoded = buffer.toString("utf-8");
        return JSON.parse(decoded) as DecodedApiKey;
    }

    get #authToken(): AuthToken {
        return {
            kind: "api_key",
            token: this.apiKey,
        };
    }

    public get scope(): BotActionScope {
        return this.#decodedApiKey.scope;
    }

    public isChatScope(): boolean {
        return "Chat" in this.scope;
    }

    public isCommunityScope(): boolean {
        return "Community" in this.scope;
    }

    public get botId(): string {
        return this.#decodedApiKey.bot_id;
    }

    public sendMessage(message: Message): Promise<BotSendMessageResponse> {
        return super.sendMessage(message, this.#authToken);
    }
}
