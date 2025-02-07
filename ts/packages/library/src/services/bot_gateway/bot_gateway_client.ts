import { HttpAgent } from "@dfinity/agent";
import type { AuthToken, BotClientConfig, Message } from "../../domain";
import type { Channel } from "../../domain/channel";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import { identity } from "../../mapping";
import {
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    LocalUserIndexBotCreateChannelArgs as BotCreateChannelArgs,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
} from "../../typebox/typebox";

export class BotGatewayClient extends MsgpackCanisterAgent {
    constructor(
        canisterId: string,
        agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super(agent, canisterId);
    }

    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse> {
        return this.executeMsgpackUpdate(
            "bot_send_message",
            message.toInputArgs(auth),
            identity,
            BotSendMessageArgs,
            BotSendMessageResponse,
        ).catch((err) => {
            console.error("Call to bot_send_message failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    createChannel(channel: Channel, auth: AuthToken): Promise<BotCreateChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_create_channel",
            channel.toInputArgs(auth),
            identity,
            BotCreateChannelArgs,
            BotCreateChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_create_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }
}
