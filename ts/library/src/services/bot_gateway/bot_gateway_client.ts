import { HttpAgent } from "@dfinity/agent";
import type {
    BotChatContext,
    BotClientConfig,
    ChannelIdentifier,
    ChatEventsCriteria,
    ChatEventsResponse,
    ChatSummaryResponse,
    CommunityIdentifier,
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
    createChannelResponse,
    deleteChannelResponse,
    sendMessageResponse,
    unitResult,
} from "../../mapping";
import {
    UnitResult as ApiUnitResult,
    LocalUserIndexBotAddReactionV2Args as BotAddReactionArgs,
    LocalUserIndexBotChatEventsArgs as BotChatEventsArgs,
    LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    LocalUserIndexBotChatSummaryArgs as BotChatSummaryArgs,
    LocalUserIndexBotChatSummaryResponse as BotChatSummaryResponse,
    LocalUserIndexBotCreateChannelV2Args as BotCreateChannelArgs,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotDeleteChannelV2Args as BotDeleteChannelArgs,
    UnitResult as BotDeleteChannelResponse,
    LocalUserIndexBotDeleteMessagesV2Args as BotDeleteMessagesArgs,
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

    deleteMessages(
        ctx: BotChatContext,
        messageIds: bigint[],
        threadRootMessageIndex?: number,
    ): Promise<UnitResult> {
        return this.executeMsgpackUpdate(
            "bot_delete_messages_v2",
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
            "bot_add_reaction_v2",
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

    chatEvents(ctx: BotChatContext, criteria: ChatEventsCriteria): Promise<ChatEventsResponse> {
        return this.executeMsgpackQuery(
            "bot_chat_events",
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
