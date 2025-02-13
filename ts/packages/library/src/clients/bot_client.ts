import jwt from "jsonwebtoken";
import { BadRequestError } from "../utils/error_response";
import { HttpAgent } from "@dfinity/agent";
import { BotGatewayClient } from "../services/bot_gateway/bot_gateway_client";
import {
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    LocalUserIndexBotDeleteChannelResponse as BotDeleteChannelResponse,
    type BotActionScope,
    type Chat,
    BotCommandArg,
    BotCommand,
} from "../typebox/typebox";
import { DataClient } from "../services/data/data.client";
import { Principal } from "@dfinity/principal";
import {
    FileMessage,
    ImageMessage,
    PollMessage,
    TextMessage,
    type AuthToken,
    type BotClientConfig,
    type DecodedApiKey,
    type DecodedJwt,
    type DecodedPayload,
    type Message,
    type BotActionChatScope,
    type BotActionCommunityScope,
} from "../domain";
import type { Channel } from "../domain/channel";
import { apiOptional } from "../mapping";

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
                this.#decoded = this.#decodeApiKey(this.#auth.token);
                break;
            case "jwt":
                this.#decoded = this.#decodeJwt(this.#auth.token);
                break;
        }
        this.#botService = new BotGatewayClient(this.#botApiGateway, agent, env);
    }

    get #botApiGateway(): string {
        switch (this.#decoded.kind) {
            case "api_key":
                return this.#decoded.gateway;
            case "jwt":
                return this.#decoded.bot_api_gateway;
        }
    }

    #decodeApiKey(apiKey: string): DecodedApiKey {
        const buffer = Buffer.from(apiKey, "base64");
        const decoded = buffer.toString("utf-8");
        const json = JSON.parse(decoded);
        return { ...json, kind: "api_key" } as DecodedApiKey;
    }

    #decodeJwt(token: string): DecodedJwt {
        const publicKey = this.#env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                return { ...decoded, kind: "jwt" } as DecodedJwt;
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
        if (isChatScope(this.scope)) {
            if ("Group" in this.scope.Chat.chat) {
                return this.scope.Chat.chat.Group.toString();
            } else if ("Channel" in this.scope.Chat.chat) {
                return this.scope.Chat.chat.Channel[0].toString();
            } else if ("Direct" in this.scope.Chat.chat) {
                return this.scope.Chat.chat.Direct.toString();
            }
        }
        return "";
    }

    #principalBytesToString(bytes: Uint8Array): string {
        return Principal.fromUint8Array(bytes).toString();
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

    public sendMessage(message: Message): Promise<BotSendMessageResponse> {
        return this.#botService.sendMessage(message, this.#auth);
    }

    public createChannel(channel: Channel): Promise<BotCreateChannelResponse> {
        return this.#botService.createChannel(channel, this.#auth);
    }

    public deleteChannel(channelId: bigint): Promise<BotDeleteChannelResponse> {
        return this.#botService.deleteChannel(channelId, this.#auth);
    }

    public get scope(): BotActionScope {
        return this.#decoded.scope;
    }

    public get chatScope(): BotActionChatScope | undefined {
        if (isChatScope(this.scope)) {
            return this.scope;
        }
    }

    public get communityScope(): BotActionCommunityScope | undefined {
        if (isCommunityScope(this.scope)) {
            return this.scope;
        }
    }

    public get messageId(): bigint | undefined {
        if (isChatScope(this.scope) && this.scope.Chat.message_id !== undefined) {
            return BigInt(this.scope.Chat.message_id);
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
            ? this.#principalBytesToString(arg.value.User)
            : undefined;
    }

    public get threadRootMessageId(): number | undefined | null {
        return this.chatScope?.Chat?.thread;
    }

    public get chatId(): Chat | undefined {
        return this.chatScope?.Chat?.chat;
    }

    public get botId(): string {
        switch (this.#decoded.kind) {
            case "api_key":
                return this.#decoded.bot_id;
            case "jwt":
                return this.#decoded.bot;
        }
    }

    public get commandArgs(): BotCommandArg[] {
        return this.command?.args ?? [];
    }

    public get commandName(): string | undefined {
        return this.command?.name;
    }

    public get initiator(): string | undefined {
        return apiOptional(this.command?.initiator, this.#principalBytesToString);
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
}

export function isChatScope(scope: BotActionScope): scope is BotActionChatScope {
    return "Chat" in scope;
}

export function isCommunityScope(scope: BotActionScope): scope is BotActionCommunityScope {
    return "Community" in scope;
}
