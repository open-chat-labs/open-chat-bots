import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import type { BotSendMessageResponse, BotCreateChannelResponse } from "./candid/types";
import type { AuthToken, BotClientConfig, Message } from "../../domain";
import type { Channel } from "../../domain/channel";
export declare class BotGatewayClient extends CandidService {
    #private;
    protected env: BotClientConfig;
    constructor(canisterId: string, agent: HttpAgent, env: BotClientConfig);
    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse>;
    createChannel(channel: Channel, auth: AuthToken): Promise<BotCreateChannelResponse>;
}
