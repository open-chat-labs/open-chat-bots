import { HttpAgent } from "@dfinity/agent";
import {
    ActionScope,
    ChannelIdentifier,
    ChatActionScope,
    CommunityActionScope,
    FileMessage,
    ImageMessage,
    OCErrorCode,
    PollMessage,
    TextMessage,
    type BotClientConfig,
    type ChatEventsCriteria,
    type ChatEventsResponse,
    type ChatIdentifier,
    type ChatSummaryResponse,
    type CreateChannelResponse,
    type DeleteChannelResponse,
    type Message,
    type SendMessageResponse,
    type UnitResult,
} from "../domain";
import type { ActionContext } from "../domain/action_context";
import type { Channel } from "../domain/channel";
import { apiOptional, principalBytesToString } from "../mapping";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import { DataClient } from "../services/data/data.client";
import { BotCommand, BotCommandArg } from "../typebox/typebox";

export class BotClient {
    #botService: BotGatewayClient;
    #env: BotClientConfig;
    #agent: HttpAgent;
    #actionContext: ActionContext;

    constructor(agent: HttpAgent, env: BotClientConfig, actionContext: ActionContext) {
        this.#actionContext = actionContext;
        this.#env = env;
        this.#agent = agent;
        this.#botService = new BotGatewayClient(this.#botApiGateway, agent, env);
    }

    get #botApiGateway(): string {
        return this.#actionContext.apiGateway;
    }

    #extractCanisterFromChat() {
        if (this.scope.isChatScope()) {
            return this.scope.chat.canisterId();
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

    public sendMessage(message: Message): Promise<SendMessageResponse> {
        if (!this.#messagePermitted(message)) {
            return Promise.resolve({
                kind: "error",
                code: OCErrorCode.InitiatorNotAuthorized,
                message: "Not authorized",
            });
        }
        if (message.isEphemeral) {
            const msg = "An ephemeral message should not be sent to the OpenChat backend";
            console.error(msg);
            return Promise.resolve({
                kind: "error",
                code: OCErrorCode.InvalidRequest,
                message: msg,
            });
        }
        return this.#botService
            .sendMessage(this.#actionContext.chatContext(message.channelId), message)
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.sendMessage failed with: ", resp);
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

    chatSummary(channelId?: bigint): Promise<ChatSummaryResponse> {
        return this.#botService
            .chatSummary(this.#actionContext.chatContext(channelId))
            .then((resp) => {
                if (resp.kind === "error") {
                    console.error("OpenChat botClient.chatDetails failed with: ", resp);
                }
                return resp;
            });
    }

    chatEvents(criteria: ChatEventsCriteria, channelId?: bigint): Promise<ChatEventsResponse> {
        return this.#botService
            .chatEvents(this.#actionContext.chatContext(channelId), criteria)
            .then((resp) => {
                if (resp.kind !== "success") {
                    console.error("OpenChat botClient.chatEvents failed with: ", resp);
                }
                return resp;
            });
    }
}
