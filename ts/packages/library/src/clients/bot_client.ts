import jwt from "jsonwebtoken";
import { BadRequestError } from "../utils/error_response";
import { HttpAgent } from "@dfinity/agent";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import { BotCommandArg, BotCommand } from "../typebox/typebox";
import { DataClient } from "../services/data/data.client";
import {
    FileMessage,
    ImageMessage,
    PollMessage,
    TextMessage,
    type AuthToken,
    type BotClientConfig,
    type DecodedJwt,
    type DecodedPayload,
    type Message,
    type SendMessageResponse,
    type CreateChannelResponse,
    type DeleteChannelResponse,
    type MergedActionScope,
    type MergedActionChatScope,
    type MergedActionCommunityScope,
    type ChatIdentifier,
    type RawCommandJwt,
    type RawApiKeyJwt,
    type ChatDetailsResponse,
    type ChatEventsCriteria,
    type ChatEventsResponse,
} from "../domain";
import type { Channel } from "../domain/channel";
import { apiOptional, mapApiKeyJwt, mapCommandJwt, principalBytesToString } from "../mapping";
import { decodeApiKey } from "../utils/decoding";

export class BotClient {
    #botService: BotGatewayClient;
    #auth: AuthToken;
    #decoded: DecodedPayload;
    #env: BotClientConfig;
    #agent: HttpAgent;

    constructor(agent: HttpAgent, env: BotClientConfig, auth: AuthToken) {
        this.#auth = auth;
        this.#env = env;
        this.#agent = agent;
        switch (this.#auth.kind) {
            case "api_key":
                this.#decoded = decodeApiKey(this.#auth.token);
                break;
            case "command_jwt":
                this.#decoded = this.#decodeCommandJwt(this.#auth.token);
                break;
            case "api_jwt":
                this.#decoded = this.#decodeApiKeyJwt(this.#auth.token);
                break;
        }
        this.#botService = new BotGatewayClient(this.#botApiGateway, agent, env);
    }

    get #botApiGateway(): string {
        return this.#decoded.bot_api_gateway;
    }

    decodeApiKeyScope(apiKey: string): MergedActionScope {
        return decodeApiKey(apiKey).scope;
    }

    #decodeCommandJwt(token: string): DecodedJwt {
        const publicKey = this.#env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                return mapCommandJwt(token, decoded as RawCommandJwt);
            } else {
                console.error(`Unable to decode jwt`, token);
                throw new BadRequestError("AccessTokenInvalid");
            }
        } catch (err) {
            console.error(`Unable to decode jwt`, err, token);
            throw new BadRequestError("AccessTokenInvalid");
        }
    }

    #decodeApiKeyJwt(token: string): DecodedJwt {
        const publicKey = this.#env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                return mapApiKeyJwt(token, decoded as RawApiKeyJwt);
            } else {
                console.error(`Unable to decode jwt`, token);
                throw new BadRequestError("AccessTokenInvalid");
            }
        } catch (err) {
            console.error(`Unable to decode jwt`, err, token);
            throw new BadRequestError("AccessTokenInvalid");
        }
    }

    #extractCanisterFromChat() {
        if (this.scope.isChatScope()) {
            return this.scope.chat.canisterId();
        }
        return "";
    }

    #hasCommand(decoded: DecodedPayload): decoded is DecodedJwt {
        return decoded.kind === "jwt";
    }

    #namedArg(name: string): BotCommandArg | undefined {
        return this.command?.args?.find((a) => a.name === name);
    }

    public get command(): BotCommand | undefined {
        if (this.#hasCommand(this.#decoded)) {
            return this.#decoded.command;
        }
    }

    #messagePermitted(message: Message): boolean {
        return message.requiredMessagePermissions.every((p) =>
            this.#decoded.hasMessagePermission(p),
        );
    }

    public sendMessage(message: Message): Promise<SendMessageResponse> {
        if (!this.#messagePermitted(message)) {
            return Promise.resolve({ kind: "not_authorized" });
        }
        if (message.isEphemeral) {
            console.error("An ephemeral message should not be sent to the OpenChat backend");
            return Promise.resolve({ kind: "invalid_request" });
        }
        return this.#botService.sendMessage(message, this.#auth).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.sendMessage failed with: ", resp);
            }
            return resp;
        });
    }

    public createChannel(channel: Channel): Promise<CreateChannelResponse> {
        if (channel.isPublic && !this.#decoded.hasCommunityPermission("CreatePublicChannel")) {
            return Promise.resolve({ kind: "not_authorized" });
        }
        if (!channel.isPublic && !this.#decoded.hasCommunityPermission("CreatePrivateChannel")) {
            return Promise.resolve({ kind: "not_authorized" });
        }
        return this.#botService.createChannel(channel, this.#auth).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.createChannel failed with: ", resp);
            }
            return resp;
        });
    }

    public deleteChannel(channelId: bigint): Promise<DeleteChannelResponse> {
        return this.#botService.deleteChannel(channelId, this.#auth).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.deleteChannel failed with: ", resp);
            }
            return resp;
        });
    }

    public get scope(): MergedActionScope {
        return this.#decoded.scope;
    }

    public get chatScope(): MergedActionChatScope | undefined {
        if (this.scope.isChatScope()) {
            return this.scope;
        }
    }

    public get communityScope(): MergedActionCommunityScope | undefined {
        if (this.scope.isCommunityScope()) {
            return this.scope;
        }
    }

    public get messageId(): bigint | undefined {
        if (this.scope.isChatScope() && this.scope.messageId !== undefined) {
            return BigInt(this.scope.messageId);
        }
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
        return this.chatScope?.thread;
    }

    public get chatId(): ChatIdentifier | undefined {
        return this.chatScope?.chat;
    }

    public get botId(): string {
        return this.#decoded.bot;
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

    chatDetails(channelId?: bigint): Promise<ChatDetailsResponse> {
        return this.#botService.chatDetails(this.#auth, channelId).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.chatDetails failed with: ", resp);
            }
            return resp;
        });
    }

    chatEvents(criteria: ChatEventsCriteria, channelId?: bigint): Promise<ChatEventsResponse> {
        return this.#botService.chatEvents(this.#auth, criteria, channelId).then((resp) => {
            if (resp.kind !== "success") {
                console.error("OpenChat botClient.chatEvents failed with: ", resp);
            }
            return resp;
        });
    }
}
