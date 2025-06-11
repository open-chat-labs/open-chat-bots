import { HttpAgent } from "@dfinity/agent";
import type {
    BotChatContext,
    BotClientConfig,
    ChannelIdentifier,
    ChatEventsCriteria,
    ChatEventsResponse,
    ChatSummaryResponse,
    CommunityIdentifier,
    CommunitySummaryResponse,
    CreateChannelResponse,
    DeleteChannelResponse,
    Message,
    SendMessageResponse,
    UnitResult,
} from "../../domain";
import type { Channel } from "../../domain/channel";
import {
    apiBotChatContext,
    apiChatEventsCriteria,
    chatEventsResponse,
    chatSummaryResponse,
    communitySummaryResponse,
    createChannelResponse,
    deleteChannelResponse,
    principalStringToBytes,
    sendMessageResponse,
    unitResult,
} from "../../mapping";
import {
    UnitResult as ApiUnitResult,
    LocalUserIndexBotAddReactionArgs as BotAddReactionArgs,
    LocalUserIndexBotChatEventsArgs as BotChatEventsArgs,
    LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    LocalUserIndexBotChatSummaryArgs as BotChatSummaryArgs,
    LocalUserIndexBotChatSummaryResponse as BotChatSummaryResponse,
    LocalUserIndexBotCommunitySummaryArgs as BotCommunitySummaryArgs,
    LocalUserIndexBotCommunitySummaryResponse as BotCommunitySummaryResponse,
    LocalUserIndexBotCreateChannelArgs as BotCreateChannelArgs,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotDeleteChannelArgs as BotDeleteChannelArgs,
    UnitResult as BotDeleteChannelResponse,
    LocalUserIndexBotDeleteMessagesArgs as BotDeleteMessagesArgs,
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
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
            "bot_send_message",
            message.toInputArgs(ctx),
            sendMessageResponse,
            BotSendMessageArgs,
            BotSendMessageResponse,
        ).catch((err) => {
            console.error("Call to bot_send_message failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    deleteMessages(
        ctx: BotChatContext,
        messageIds: bigint[],
        threadRootMessageIndex?: number,
    ): Promise<UnitResult> {
        return this.executeMsgpackUpdate(
            "bot_delete_messages",
            {
                chat_context: apiBotChatContext(ctx),
                message_ids: messageIds,
                thread: threadRootMessageIndex,
            },
            unitResult,
            BotDeleteMessagesArgs,
            ApiUnitResult,
        ).catch((err) => {
            console.error("Call to bot_delete_messages failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    addReaction(
        ctx: BotChatContext,
        reaction: string,
        messageId: bigint,
        threadRootMessageIndex?: number,
    ): Promise<UnitResult> {
        return this.executeMsgpackUpdate(
            "bot_add_reaction",
            {
                chat_context: apiBotChatContext(ctx),
                message_id: messageId,
                reaction,
                thread: threadRootMessageIndex,
            },
            unitResult,
            BotAddReactionArgs,
            ApiUnitResult,
        ).catch((err) => {
            console.error("Call to bot_add_reaction failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    createChannel(
        communityId: CommunityIdentifier,
        channel: Channel,
    ): Promise<CreateChannelResponse> {
        return this.executeMsgpackUpdate(
            "bot_create_channel",
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
            "bot_delete_channel",
            { channel_id: BigInt(id.channelId), community_id: id.communityId },
            deleteChannelResponse,
            BotDeleteChannelArgs,
            BotDeleteChannelResponse,
        ).catch((err) => {
            console.error("Call to bot_delete_channel failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    communitySummary(communityId: CommunityIdentifier): Promise<CommunitySummaryResponse> {
        return this.executeMsgpackQuery(
            "bot_community_summary",
            { community_id: principalStringToBytes(communityId.communityId) },
            communitySummaryResponse,
            BotCommunitySummaryArgs,
            BotCommunitySummaryResponse,
        ).catch((err) => {
            console.error("Call to bot_chat_summary failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    chatSummary(ctx: BotChatContext): Promise<ChatSummaryResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_summary",
            { chat_context: apiBotChatContext(ctx) },
            chatSummaryResponse,
            BotChatSummaryArgs,
            BotChatSummaryResponse,
        ).catch((err) => {
            console.error("Call to bot_chat_summary failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    chatEvents(
        ctx: BotChatContext,
        criteria: ChatEventsCriteria,
        thread?: number,
    ): Promise<ChatEventsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_events",
            {
                chat_context: apiBotChatContext(ctx),
                events: apiChatEventsCriteria(criteria),
                thread,
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
