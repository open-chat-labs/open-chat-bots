import { HttpAgent } from "@dfinity/agent";
import type { AuthToken, BotClientConfig, Message } from "../../domain";
import type { Channel } from "../../domain/channel";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import { LocalUserIndexBotSendMessageResponse as BotSendMessageResponse, LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse } from "../../typebox/typebox";
export declare class BotGatewayClient extends MsgpackCanisterAgent {
    protected env: BotClientConfig;
    constructor(canisterId: string, agent: HttpAgent, env: BotClientConfig);
    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse>;
    createChannel(channel: Channel, auth: AuthToken): Promise<BotCreateChannelResponse>;
}
