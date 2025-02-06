import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import { type BotService, idlFactory } from "./candid/idl";
import type { BotSendMessageResponse, BotCreateChannelResponse } from "./candid/types";
import type { AuthToken, BotClientConfig, Message } from "../../domain";
import type { Channel } from "../../domain/channel";

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

    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse> {
        return CandidService.handleResponse(
            this.#botService.bot_send_message(message.toInputArgs(auth)),
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

    createChannel(channel: Channel, auth: AuthToken): Promise<BotCreateChannelResponse> {
        return CandidService.handleResponse(
            this.#botService.bot_create_channel(channel.toInputArgs(auth)),
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
