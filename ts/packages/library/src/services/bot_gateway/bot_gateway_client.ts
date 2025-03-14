import { HttpAgent } from "@dfinity/agent";
import type {
    AuthToken,
    BotClientConfig,
    Message,
    SendMessageResponse,
    CreateChannelResponse,
    DeleteChannelResponse,
    ChatDetailsResponse,
    ChatEventsResponse,
    ChatEventsCriteria,
} from "../../domain";
import type { Channel } from "../../domain/channel";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import {
    apiAuthToken,
    sendMessageResponse,
    createChannelResponse,
    deleteChannelResponse,
    chatDetailsResponse,
    chatEventsResponse,
    apiChatEventsCriteria,
} from "../../mapping";
import {
    LocalUserIndexBotDeleteChannelArgs as BotDeleteChannelArgs,
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    LocalUserIndexBotCreateChannelArgs as BotCreateChannelArgs,
    LocalUserIndexBotDeleteChannelResponse as BotDeleteChannelResponse,
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotChatDetailsArgs as BotChatDetailsArgs,
    LocalUserIndexBotChatDetailsResponse as BotChatDetailsResponse,
    LocalUserIndexBotChatEventsArgs as BotChatEventsArgs,
    LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
} from "../../typebox/typebox";

export class BotGatewayClient extends MsgpackCanisterAgent {
    constructor(
        canisterId: string,
        agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super(agent, canisterId);
    }

    sendMessage(message: Message, auth: AuthToken): Promise<SendMessageResponse> {
        return this.executeMsgpackUpdate(
            "bot_send_message",
            message.toInputArgs(auth),
            sendMessageResponse,
            BotSendMessageArgs,
            BotSendMessageResponse,
        ).catch((err) => {
            console.error("Call to bot_send_message failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    createChannel(channel: Channel, auth: AuthToken): Promise<CreateChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_create_channel",
            channel.toInputArgs(auth),
            createChannelResponse,
            BotCreateChannelArgs,
            BotCreateChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_create_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    deleteChannel(channelId: bigint, auth: AuthToken): Promise<DeleteChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_delete_channel",
            { channel_id: channelId, auth_token: apiAuthToken(auth) },
            deleteChannelResponse,
            BotDeleteChannelArgs,
            BotDeleteChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_delete_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    chatDetails(auth: AuthToken, channelId?: bigint): Promise<ChatDetailsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_details",
            { channel_id: channelId, auth_token: apiAuthToken(auth) },
            chatDetailsResponse,
            BotChatDetailsArgs,
            BotChatDetailsResponse,
        ).catch((err) => {
            console.error("Call to bot_chat_details failed with: ", JSON.stringify(err));
            return { kind: "server_error" };
        });
    }

    chatEvents(
        auth: AuthToken,
        criteria: ChatEventsCriteria,
        channelId?: bigint,
    ): Promise<ChatEventsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_events",
            {
                channel_id: channelId,
                auth_token: apiAuthToken(auth),
                events: apiChatEventsCriteria(criteria),
            },
            chatEventsResponse,
            BotChatEventsArgs,
            BotChatEventsResponse,
        ).catch((err) => {
            console.error("Call to bot_chat_events failed with: ", JSON.stringify(err));
            throw err;
        });
    }
}
