import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../utils/candidService";
import type { AuthToken, BotClientConfig, Message } from "../types";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";

export class BotClientBase extends CandidService {
    #botService!: BotGatewayClient;

    constructor(
        protected agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super();
    }

    protected createBotService(canisterId: string) {
        this.#botService = new BotGatewayClient(canisterId, this.agent, this.env);
    }

    protected sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse> {
        return this.#botService.sendMessage(message, auth);
    }
}
