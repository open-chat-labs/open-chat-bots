import { HttpAgent } from "@dfinity/agent";
import type {
    BotChatContext,
    BotClientConfig,
    ChannelIdentifier,
    ChatDetailsResponse,
    ChatEventsCriteria,
    ChatEventsResponse,
    CommunityIdentifier,
    CreateChannelResponse,
    DeleteChannelResponse,
    Message,
    SendMessageResponse,
} from "../../domain";
import type { Channel } from "../../domain/channel";
import {
    apiBotChatContext,
    apiChatEventsCriteria,
    chatDetailsResponse,
    chatEventsResponse,
    createChannelResponse,
    deleteChannelResponse,
    sendMessageResponse,
} from "../../mapping";
import {
    LocalUserIndexBotChatDetailsV2Args as BotChatDetailsArgs,
    LocalUserIndexBotChatDetailsResponse as BotChatDetailsResponse,
    LocalUserIndexBotChatEventsV2Args as BotChatEventsArgs,
    LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    LocalUserIndexBotCreateChannelV2Args as BotCreateChannelArgs,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotDeleteChannelV2Args as BotDeleteChannelArgs,
    UnitResult as BotDeleteChannelResponse,
    LocalUserIndexBotSendMessageV2Args as BotSendMessageArgs,
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
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

    sendMessage(ctx: BotChatContext, message: Message): Promise<SendMessageResponse> {
        return this.executeMsgpackUpdate(
            "bot_send_message_v2",
            message.toInputArgs(ctx),
            sendMessageResponse,
            BotSendMessageArgs,
            BotSendMessageResponse,
        ).catch((err) => {
            console.error("Call to bot_send_message failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    createChannel(
        communityId: CommunityIdentifier,
        channel: Channel,
    ): Promise<CreateChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_create_channel_v2",
            channel.toInputArgs(communityId),
            createChannelResponse,
            BotCreateChannelArgs,
            BotCreateChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_create_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    deleteChannel(id: ChannelIdentifier): Promise<DeleteChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_delete_channel_v2",
            { channel_id: BigInt(id.channelId), community_id: id.communityId },
            deleteChannelResponse,
            BotDeleteChannelArgs,
            BotDeleteChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_delete_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    chatDetails(ctx: BotChatContext): Promise<ChatDetailsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_details_v2",
            { chat_context: apiBotChatContext(ctx) },
            chatDetailsResponse,
            BotChatDetailsArgs,
            BotChatDetailsResponse,
        ).catch((err) => {
            console.error("Call to bot_chat_details failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    chatEvents(ctx: BotChatContext, criteria: ChatEventsCriteria): Promise<ChatEventsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_events_v2",
            {
                chat_context: apiBotChatContext(ctx),
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
