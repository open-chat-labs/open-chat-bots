import { Principal } from "@dfinity/principal";
import type { HttpAgent } from "@dfinity/agent";
import { BadRequestError } from "../utils/badrequest";
import type { BotActionChatScope, BotClientConfig, Message } from "../types";
import type { Chat } from "../services/storageBucket/candid/types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { DataClient } from "../services/data/data.client";
import { ApiKeyBotClientBase } from "./api_client_base";

export class ApiKeyBotChatClient extends ApiKeyBotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, apiKey: string) {
        super(agent, env, apiKey);
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

    createTextMessage(
        finalised: boolean,
        text: string,
        blockLevelMarkdown: boolean = false,
    ): Promise<Message> {
        return Promise.resolve({
            id: this.messageId,
            content: {
                Text: { text },
            },
            finalised,
            blockLevelMarkdown,
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

    sendTextMessage(
        finalised: boolean,
        text: string,
        blockLevelMarkdown?: boolean,
    ): Promise<BotSendMessageResponse> {
        return this.createTextMessage(finalised, text, blockLevelMarkdown).then((msg) =>
            this.sendMessage(msg),
        );
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
    ): Promise<BotSendMessageResponse> {
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
    ): Promise<BotSendMessageResponse> {
        return this.createFileMessage(finalised, name, data, mimeType, fileSize, caption).then(
            (msg) => this.sendMessage(msg),
        );
    }
}
