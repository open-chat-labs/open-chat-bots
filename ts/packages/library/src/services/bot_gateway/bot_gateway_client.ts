import { HttpAgent } from "@dfinity/agent";
import type {
    AuthToken,
    BotClientConfig,
    ChatDetailsResponse,
    ChatEventsCriteria,
    ChatEventsResponse,
    ChatSubscriptionType,
    CreateChannelResponse,
    DeleteChannelResponse,
    Message,
    SendMessageResponse,
    UnitResult,
} from "../../domain";
import type { Channel } from "../../domain/channel";
import {
    apiAuthToken,
    apiChatEventsCriteria,
    chatDetailsResponse,
    chatEventsResponse,
    createChannelResponse,
    deleteChannelResponse,
    sendMessageResponse,
    subscriptionEventType,
    unitResult,
} from "../../mapping";
import {
    UnitResult as ApiUnitResult,
    LocalUserIndexBotChatDetailsArgs as BotChatDetailsArgs,
    LocalUserIndexBotChatDetailsResponse as BotChatDetailsResponse,
    LocalUserIndexBotChatEventsArgs as BotChatEventsArgs,
    LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    LocalUserIndexBotCreateChannelArgs as BotCreateChannelArgs,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotDeleteChannelArgs as BotDeleteChannelArgs,
    LocalUserIndexBotDeleteChannelResponse as BotDeleteChannelResponse,
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    LocalUserIndexBotSubscribeToChatEventsArgs as BotSubscribeToChatEventsArgs,
} from "../../typebox/typebox";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";

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

    subscribeToChatEvents(
        apiKey: string,
        subscriptionTypes: ChatSubscriptionType[],
        channelId?: bigint,
    ): Promise<UnitResult> {
        return this.executeMsgpackUpdate(
            "bot_subscribe_to_chat_events",
            {
                api_key: apiKey,
                channel_id: channelId,
                event_types: subscriptionTypes.map(subscriptionEventType),
            },
            unitResult,
            BotSubscribeToChatEventsArgs,
            ApiUnitResult,
        ).catch((err) => {
            console.error(
                "Call to bot_subscribe_to_chat_events failed with: ",
                JSON.stringify(err),
            );
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
