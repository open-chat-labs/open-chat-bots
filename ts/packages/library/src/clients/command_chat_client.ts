import { Principal } from "@dfinity/principal";
import { BotClientBase } from "./client_base";
import type { HttpAgent } from "@dfinity/agent";
import type { BotActionChatScope, BotClientConfig, BotCommandArg, Message } from "../types";
import { BadRequestError } from "../utils/badrequest";
import type { Chat } from "../services/storageBucket/candid/types";
import type { ExecuteBotCommandResponse } from "../services/bot_gateway/candid/types";
import { DataClient } from "../services/data/data.client";

export class BotCommandChatClient extends BotClientBase {
    constructor(
        private agent: HttpAgent,
        env: BotClientConfig,
        encodedJwt: string,
    ) {
        super(agent, env, encodedJwt);
        if (!this.isChatScope) {
            throw new BadRequestError("AccessTokenInvalid");
        }
    }

    #extractCanisterFromChat() {
        if ("Group" in this.scope.Chat.chat) {
            return this.scope.Chat.chat.Group.toString();
        } else if ("Channel" in this.scope.Chat.chat) {
            return this.scope.Chat.chat.Channel[0].toString();
        }
        return "";
    }

    createTextMessage(finalised: boolean, text: string): Promise<Message> {
        return Promise.resolve({
            id: this.messageId,
            content: {
                Text: { text },
            },
            finalised,
        });
    }

    get scope(): BotActionChatScope {
        return super.scope as BotActionChatScope;
    }

    public get messageId(): bigint {
        return this.scope.Chat.message_id;
    }

    public get threadRootMessageId(): number | undefined | null {
        return this.scope.Chat.thread_root_message_index;
    }

    public get chatId(): Chat {
        return this.scope.Chat.chat;
    }

    #namedArg(name: string): BotCommandArg | undefined {
        return this.decodedJwt.command.args.find((a) => a.name === name);
    }

    #principalBytesToString(bytes: Uint8Array): string {
        return Principal.fromUint8Array(bytes).toString();
    }

    public stringArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "String" in arg.value ? arg.value.String : undefined;
    }

    public booleanArg(name: string): boolean | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Boolean" in arg.value ? arg.value.Boolean : undefined;
    }

    public numberArg(name: string): number | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Number" in arg.value ? arg.value.Number : undefined;
    }

    public userArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "User" in arg.value
            ? this.#principalBytesToString(arg.value.User)
            : undefined;
    }

    public get commandArgs(): BotCommandArg[] {
        return this.decodedJwt.command.args;
    }

    public get commandName(): string {
        return this.decodedJwt.command.name;
    }

    public get initiator(): string {
        return this.decodedJwt.command.initiator;
    }

    sendTextMessage(finalised: boolean, text: string): Promise<ExecuteBotCommandResponse> {
        return this.createTextMessage(finalised, text).then((msg) => this.sendMessage(msg));
    }

    sendMessage(message: Message): Promise<ExecuteBotCommandResponse> {
        return this.executeAction({
            SendMessage: message,
        });
    }

    createImageMessage(
        finalised: boolean,
        imageData: Uint8Array,
        mimeType: string,
        width: number,
        height: number,
        caption?: string,
    ): Promise<Message> {
        const dataClient = new DataClient(this.agent, this.env);
        const canisterId = this.#extractCanisterFromChat();
        console.log("Upload canister: ", canisterId);
        const uploadContentPromise = dataClient.uploadData([canisterId], mimeType, imageData);

        return uploadContentPromise.then((blobRef) => {
            return {
                id: this.messageId,
                content: {
                    Image: {
                        height,
                        mime_type: mimeType,
                        blob_reference: [
                            {
                                blob_id: blobRef.blobId,
                                canister_id: Principal.fromText(blobRef.canisterId),
                            },
                        ],
                        thumbnail_data: "",
                        caption: caption ? [caption] : [],
                        width,
                    },
                },
                finalised,
            };
        });
    }

    sendImageMessage(
        finalised: boolean,
        imageData: Uint8Array,
        mimeType: string,
        width: number,
        height: number,
        caption?: string,
    ): Promise<ExecuteBotCommandResponse> {
        return this.createImageMessage(finalised, imageData, mimeType, width, height, caption).then(
            (msg) => this.sendMessage(msg),
        );
    }

    createFileMessage(
        finalised: boolean,
        name: string,
        data: Uint8Array,
        mimeType: string,
        fileSize: number,
        caption?: string,
    ): Promise<Message> {
        const dataClient = new DataClient(this.agent, this.env);
        const canisterId = this.#extractCanisterFromChat();
        const uploadContentPromise = dataClient.uploadData([canisterId], mimeType, data);

        return uploadContentPromise.then((blobRef) => {
            return {
                id: this.messageId,
                content: {
                    File: {
                        name,
                        file_size: fileSize,
                        mime_type: mimeType,
                        blob_reference: [
                            {
                                blob_id: blobRef.blobId,
                                canister_id: Principal.fromText(blobRef.canisterId),
                            },
                        ],
                        caption: caption ? [caption] : [],
                    },
                },
                finalised,
            };
        });
    }

    sendFileMessage(
        finalised: boolean,
        name: string,
        data: Uint8Array,
        mimeType: string,
        fileSize: number,
        caption?: string,
    ): Promise<ExecuteBotCommandResponse> {
        return this.createFileMessage(finalised, name, data, mimeType, fileSize, caption).then(
            (msg) => this.sendMessage(msg),
        );
    }
}
