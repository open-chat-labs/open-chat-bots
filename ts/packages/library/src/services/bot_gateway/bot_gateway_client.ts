import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import { type BotService, idlFactory } from "./candid/idl";
import type { BotSendMessageResponse, AuthToken as ApiAuthToken } from "./candid/types";
import type { AuthToken, BotClientConfig, Message } from "../../types";

export class BotGatewayClient extends CandidService {
    #botService: BotService;

    constructor(
        canisterId: string,
        agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super();

        this.#botService = CandidService.createServiceClient<BotService>(
            idlFactory,
            canisterId,
            env.icHost,
            agent,
        );
    }

    #mapAuthToken(auth: AuthToken): ApiAuthToken {
        switch (auth.kind) {
            case "api_key":
                return {
                    ApiKey: auth.token,
                };
            case "jwt":
                return {
                    Jwt: auth.token,
                };
        }
    }

    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse> {
        return CandidService.handleResponse(
            this.#botService.bot_send_message({
                channel_id: [],
                message_id: [],
                content: message.content,
                finalised: message.finalised,
                block_level_markdown: message.blockLevelMarkdown ?? false,
                auth_token: this.#mapAuthToken(auth),
            }),
            (res) => {
                if (!("Success" in res)) {
                    console.error("Call to execute_bot_action failed with: ", JSON.stringify(res));
                }
                return res;
            },
        ).catch((err) => {
            console.error("Call to execute_bot_action failed with: ", JSON.stringify(err));
            throw err;
        });
    }
}
