import { HttpAgent } from "@dfinity/agent";
import {
    ActionScope,
    ChannelIdentifier,
    ChatActionScope,
    CommunityActionScope,
    CommunityIdentifier,
    FileMessage,
    ImageMessage,
    MiniAppMessage,
    OCErrorCode,
    PollMessage,
    PriceChartMessage,
    TextMessage,
    type BotClientConfig,
    type BotInstallationEventsResponse,
    type ChangeRoleResponse,
    type ChatEventsCriteria,
    type ChatEventsResponse,
    type ChatIdentifier,
    type ChatSummaryResponse,
    type CommunityEventsCriteria,
    type CommunityEventsResponse,
    type CommunitySummaryResponse,
    type CreateChannelResponse,
    type DeleteChannelResponse,
    type MembersResponse,
    type Message,
    type PermissionRole,
    type PriceChartContent,
    type SendMessageResponse,
    type UnitResult,
    type UserSummaryResponse,
} from "../domain";
import type { MiniAppSize } from "../domain";
import type { ActionContext } from "../domain/action_context";
import type { Channel } from "../domain/channel";
import { apiOptional, principalBytesToString } from "../mapping";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import { DataClient } from "../services/data/data.client";
import { BotCommand, BotCommandArg, MemberType, OgPreview } from "../typebox/typebox";
import { DEFAULT_PREVIEW_PROXY_URL, fetchOgPreviewsForText } from "../utils/linkPreviews";
import { random64 } from "../utils/rng";
import { GlobalClient } from "./global_client";

export class BotClient {
    #globalService: GlobalClient;
    #botService: BotGatewayClient;
    #env: BotClientConfig;
    #agent: HttpAgent;
    #actionContext: ActionContext;

    constructor(agent: HttpAgent, env: BotClientConfig, actionContext: ActionContext) {
        this.#actionContext = actionContext;
        this.#env = env;
        this.#agent = agent;
        this.#botService = new BotGatewayClient(this.#botApiGateway, agent, env);
        this.#globalService = new GlobalClient(agent, env);
    }

    get #botApiGateway(): string {
        return this.#actionContext.apiGateway;
    }

    // The canister which holds the chat, or the community, for a community's scope, eg. to upload
    // a message's file for
    #extractCanisterFromChat() {
        if (this.scope.isChatScope()) {
            return this.scope.chat.canisterId();
        }
        if (this.scope.isCommunityScope()) {
            return this.scope.communityId.canisterId();
        }
        return "";
    }

    #namedArg(name: string): BotCommandArg | undefined {
        return this.command?.args?.find((a) => a.name === name);
    }

    public get command(): BotCommand | undefined {
        return this.#actionContext.command;
    }

    #messagePermitted(message: Message): boolean {
        return message.requiredMessagePermissions.every((p) =>
            this.#actionContext.hasMessagePermission(p),
        );
    }

    public addReaction(messageId: bigint, reaction: string, thread?: number): Promise<UnitResult> {
        return this.#botService.addReaction(
            this.#actionContext.chatContext(),
            reaction,
            messageId,
            thread,
        );
    }

    public deleteMessages(messageIds: bigint[], thread?: number): Promise<UnitResult> {
        return this.#botService.deleteMessages(
            this.#actionContext.chatContext(),
            messageIds,
            thread,
        );
    }

    // Works out what to send as og_previews. Previews explicitly set on the message always win
    // (an empty array being an explicit "no previews"), otherwise - unless the bot has opted out -
    // we look for links in the message text and ask the preview service about them.
    //
    // This must never throw. A failure to obtain previews must never become a send failure.
    async #resolveOgPreviews(message: Message): Promise<OgPreview[] | undefined> {
        try {
            if (message.ogPreviews !== undefined) return message.ogPreviews;
            if (this.#env.autoFetchOgPreviews === false) return undefined;
            const previews = await fetchOgPreviewsForText(
                message.text,
                this.#env.previewProxyUrl ?? DEFAULT_PREVIEW_PROXY_URL,
            );
            return previews.length > 0 ? previews : undefined;
        } catch (err) {
            console.error("OpenChat botClient: unable to obtain og previews: ", err);
            return undefined;
        }
    }

    public async sendMessage(message: Message): Promise<SendMessageResponse> {
        if (!this.#messagePermitted(message)) {
            return {
                kind: "error",
                code: OCErrorCode.InitiatorNotAuthorized,
                message: "Not authorized",
            };
        }
        if (message.isEphemeral) {
            const msg = "An ephemeral message should not be sent to the OpenChat backend";
            console.error(msg);
            return {
                kind: "error",
                code: OCErrorCode.InvalidRequest,
                message: msg,
            };
        }
        // Note we only get here for messages that are actually going to be sent, so we never pay
        // for a preview lookup on a message that is rejected above.
        const ogPreviews = await this.#resolveOgPreviews(message);
        return this.#botService
            .sendMessage(this.#actionContext.chatContext(message.channelId), message, ogPreviews)
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.sendMessage failed with: ", resp);
                }
                return resp;
            });
    }

    /**
     * Changes the text, or caption, of one of the bot's own messages to `message`'s, which must be
     * of the same type. OpenChat takes nothing else from the content, so an image stays the same
     * image, and refuses an edit of a poll, a deleted message or a MiniApp card, which never
     * changes. The message's thread (`setThread`), channel (`setChannelId`, for a client in a
     * community's scope), block level markdown and link previews apply.
     *
     * A bot edits its messages autonomously, as OpenChat refuses an edit made with a command's
     * token, so this needs a client from `createClientInAutonomouseContext` and the autonomous
     * permission to send the content's type.
     */
    public async editMessage(messageId: bigint, message: Message): Promise<UnitResult> {
        if (this.#actionContext.jwt !== undefined) {
            return {
                kind: "error",
                code: OCErrorCode.InvalidRequest,
                message: "Bots must edit their messages autonomously",
            };
        }
        if (!this.#messagePermitted(message)) {
            return {
                kind: "error",
                code: OCErrorCode.InitiatorNotAuthorized,
                message: "Not authorized",
            };
        }
        const ogPreviews = await this.#resolveOgPreviews(message);
        return this.#botService
            .editMessage(
                this.#actionContext.chatContext(message.channelId),
                messageId,
                message,
                ogPreviews,
            )
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.editMessage failed with: ", resp);
                }
                return resp;
            });
    }

    public createChannel(channel: Channel): Promise<CreateChannelResponse> {
        if (
            channel.isPublic &&
            !this.#actionContext.hasCommunityPermission("CreatePublicChannel")
        ) {
            return Promise.resolve({
                kind: "error",
                code: OCErrorCode.InitiatorNotAuthorized,
                message: "Not authorized",
            });
        }
        if (
            !channel.isPublic &&
            !this.#actionContext.hasCommunityPermission("CreatePrivateChannel")
        ) {
            return Promise.resolve({
                kind: "error",
                code: OCErrorCode.InitiatorNotAuthorized,
                message: "Not authorized",
            });
        }

        if (!this.#actionContext.scope.isCommunityScope()) {
            return Promise.resolve({
                kind: "error",
                code: OCErrorCode.InvalidBotActionScope,
                message: "You can only create a channel within the context of a community",
            });
        }
        return this.#botService
            .createChannel(this.#actionContext.scope.communityId, channel)
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.createChannel failed with: ", resp);
                }
                return resp;
            });
    }

    public deleteChannel(channelId: ChannelIdentifier): Promise<DeleteChannelResponse> {
        return this.#botService.deleteChannel(channelId).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.deleteChannel failed with: ", resp);
            }
            return resp;
        });
    }

    public changeRole(userIds: string[], newRole: PermissionRole): Promise<ChangeRoleResponse> {
        return this.#botService
            .changeRole(this.#actionContext.chatContext(), userIds, newRole)
            .then((resp) => {
                if (resp.kind === "error") {
                    console.error("OpenChat botClient.changeRole failed with: ", resp);
                } else if (resp.kind === "partial_success") {
                    console.error("OpenChat botClient.changeRole failed for some users: ", resp);
                }
                return resp;
            });
    }

    public get scope(): ActionScope {
        return this.#actionContext.scope;
    }

    public get chatScope(): ChatActionScope | undefined {
        if (this.scope.isChatScope()) {
            return this.scope;
        }
    }

    public get communityScope(): CommunityActionScope | undefined {
        if (this.scope.isCommunityScope()) {
            return this.scope;
        }
    }

    public get messageId(): bigint | undefined {
        return this.#actionContext.messageId;
    }

    /** The LocalUserIndex the client calls OpenChat through */
    public get apiGateway(): string {
        return this.#actionContext.apiGateway;
    }

    public stringArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "String" in arg.value ? arg.value.String : undefined;
    }

    public booleanArg(name: string): boolean | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Boolean" in arg.value ? arg.value.Boolean : undefined;
    }

    public decimalArg(name: string): number | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Decimal" in arg.value ? arg.value.Decimal : undefined;
    }

    public integerArg(name: string): bigint | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Integer" in arg.value ? arg.value.Integer : undefined;
    }

    public userArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "User" in arg.value
            ? principalBytesToString(arg.value.User)
            : undefined;
    }

    public get threadRootMessageId(): number | undefined | null {
        return this.#actionContext.thread;
    }

    public get channelId(): bigint | undefined {
        if (this.chatScope?.chat.isChannel()) {
            return this.chatScope.chat.channelId;
        }
        return undefined;
    }

    public get communityId(): CommunityIdentifier | undefined {
        if (this.scope.isCommunityScope()) {
            return this.scope.communityId;
        } else if (this.scope.isChatScope()) {
            if (this.scope.chat.isChannel()) {
                return new CommunityIdentifier(this.scope.chat.communityId);
            }
        }
    }

    public get chatId(): ChatIdentifier | undefined {
        return this.chatScope?.chat;
    }

    public get commandTimezone(): string | undefined {
        return this.command?.meta?.timezone;
    }

    public get commandLanguage(): string | undefined {
        return this.command?.meta?.language;
    }

    public get commandArgs(): BotCommandArg[] {
        return this.command?.args ?? [];
    }

    public get commandName(): string | undefined {
        return this.command?.name;
    }

    public get initiator(): string | undefined {
        return apiOptional(this.command?.initiator, principalBytesToString);
    }

    createTextMessage(text: string): Promise<TextMessage> {
        return Promise.resolve(new TextMessage(text).setContextMessageId(this.messageId));
    }

    createPollMessage(question: string, answers: string[]): Promise<PollMessage> {
        return Promise.resolve(
            new PollMessage(question, answers).setContextMessageId(this.messageId),
        );
    }

    createPriceChartMessage(chart: Omit<PriceChartContent, "kind">): Promise<PriceChartMessage> {
        return Promise.resolve(new PriceChartMessage(chart).setContextMessageId(this.messageId));
    }

    /**
     * A MiniApp card for a game, whose buttons open the bot's app, at the client's message id. See
     * `MiniAppMessage`. `app` names one of the bot's apps in its definition, whose image the card
     * shows whenever there's no app to show. Check the card with its `validate` before posting it
     * with `MiniAppServiceClient.post`.
     */
    createMiniAppMessage(app: string, text: string, appSize: MiniAppSize): Promise<MiniAppMessage> {
        return Promise.resolve(
            new MiniAppMessage(app, text, appSize).setContextMessageId<MiniAppMessage>(
                this.messageId,
            ),
        );
    }

    /**
     * A token to post one MiniApp card through OpenChat's MiniApp service, with
     * `MiniAppServiceClient.post`. The service posts every card, as the bot, so that it knows each
     * game from the moment its card exists, and `sendMessage` refuses one. The token is for the
     * chat the client would send a message in, a command's or an autonomous one, with the same
     * options: `channelId` names the channel for a client in a community's scope, `thread` the
     * thread to post in, and `messageId` the card's message id, if the bot chooses one. A chat
     * command's token fixes the message id, which `messageId` must then match; otherwise, for an
     * autonomous card or a community command's, it's picked here, at random, unless the bot gives
     * one, as OpenChat can't pick one in a query. The token lasts an hour, and posting it twice
     * posts one card, so a bot which got no answer posts it again. It needs the MiniApp permission.
     * Rejects, with OpenChat's error, if the bot isn't given one, eg. as it isn't installed in the
     * chat.
     */
    async miniAppPostToken(
        options: { channelId?: bigint; thread?: number; messageId?: bigint } = {},
    ): Promise<string> {
        if (!this.#actionContext.hasMessagePermission("MiniApp")) {
            throw new Error("Not authorized: the bot lacks the MiniApp permission here");
        }
        // Only a chat command's token carries a message id
        const fixed = this.#actionContext.messageId !== undefined;
        return this.#botService.miniAppPostToken(
            this.#actionContext.chatContext(options.channelId),
            {
                ...options,
                messageId: options.messageId ?? (fixed ? undefined : random64()),
            },
        );
    }

    createImageMessage(
        imageData: Uint8Array,
        mimeType: string,
        width: number,
        height: number,
    ): Promise<ImageMessage> {
        const dataClient = new DataClient(this.#agent, this.#env);
        const canisterId = this.#extractCanisterFromChat();
        const uploadContentPromise = dataClient.uploadData([canisterId], mimeType, imageData);

        return uploadContentPromise.then((blobReference) => {
            return new ImageMessage(
                width,
                height,
                mimeType,
                blobReference,
            ).setContextMessageId<ImageMessage>(this.messageId);
        });
    }

    createFileMessage(
        name: string,
        data: Uint8Array,
        mimeType: string,
        fileSize: number,
    ): Promise<FileMessage> {
        const dataClient = new DataClient(this.#agent, this.#env);
        const canisterId = this.#extractCanisterFromChat();
        const uploadContentPromise = dataClient.uploadData([canisterId], mimeType, data);

        return uploadContentPromise.then((blobReference) => {
            return new FileMessage(
                name,
                mimeType,
                fileSize,
                blobReference,
            ).setContextMessageId<FileMessage>(this.messageId);
        });
    }

    members(memberTypes: MemberType[], channelId?: bigint): Promise<MembersResponse> {
        return this.#botService
            .members(
                this.#actionContext.communityOrGroupChatContext(),
                memberTypes,
                channelId ?? this.channelId,
            )
            .then((resp) => {
                if (resp.kind === "error") {
                    console.error("OpenChat botClient.members failed with: ", resp);
                }
                return resp;
            });
    }

    chatSummary(channelId?: bigint): Promise<ChatSummaryResponse> {
        return this.#botService
            .chatSummary(this.#actionContext.chatContext(channelId))
            .then((resp) => {
                if (resp.kind === "error") {
                    console.error("OpenChat botClient.chatSummary failed with: ", resp);
                }
                return resp;
            });
    }

    communitySummary(communityId: CommunityIdentifier): Promise<CommunitySummaryResponse> {
        return this.#botService.communitySummary(communityId).then((resp) => {
            if (resp.kind === "error") {
                console.error("OpenChat botClient.communitySummary failed with: ", resp);
            }
            return resp;
        });
    }

    chatEvents(
        criteria: ChatEventsCriteria,
        thread?: number,
        channelId?: bigint,
    ): Promise<ChatEventsResponse> {
        return this.#botService
            .chatEvents(this.#actionContext.chatContext(channelId), criteria, thread)
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.chatEvents failed with: ", resp);
                }
                return resp;
            });
    }

    communityEvents(criteria: CommunityEventsCriteria): Promise<CommunityEventsResponse> {
        const id = this.communityId;
        if (id !== undefined) {
            return this.#botService.communityEvents(id, criteria).then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.chatEvents failed with: ", resp);
                }
                return resp;
            });
        } else {
            return Promise.resolve({ kind: "error", code: 0, message: undefined });
        }
    }

    userSummary(userId?: string): Promise<UserSummaryResponse> {
        const u = userId ?? this.initiator;
        if (u === undefined) {
            console.error(
                "No userId provided and no userId can be derived from the execution context",
            );
            return Promise.resolve({ kind: "user_not_found" });
        }
        return this.#globalService.userSummary(u);
    }

    installationEvents(): Promise<BotInstallationEventsResponse> {
        return this.#globalService.installationEvents();
    }
}
