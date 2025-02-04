import type { HttpAgent } from "@dfinity/agent";
import type { BotActionChatScope, BotClientConfig, Message } from "../types";
import type { Chat } from "../services/storageBucket/candid/types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { CommandBotClientBase } from "./command_client_base";
export declare class CommandBotChatClient extends CommandBotClientBase {
    #private;
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string);
    createTextMessage(finalised: boolean, text: string, blockLevelMarkdown?: boolean): Promise<Message>;
    get scope(): BotActionChatScope;
    get messageId(): bigint;
    get threadRootMessageId(): number | undefined | null;
    get chatId(): Chat;
    sendTextMessage(finalised: boolean, text: string, blockLevelMarkdown?: boolean): Promise<BotSendMessageResponse>;
    createImageMessage(finalised: boolean, imageData: Uint8Array, mimeType: string, width: number, height: number, caption?: string): Promise<Message>;
    sendImageMessage(finalised: boolean, imageData: Uint8Array, mimeType: string, width: number, height: number, caption?: string): Promise<BotSendMessageResponse>;
    createFileMessage(finalised: boolean, name: string, data: Uint8Array, mimeType: string, fileSize: number, caption?: string): Promise<Message>;
    sendFileMessage(finalised: boolean, name: string, data: Uint8Array, mimeType: string, fileSize: number, caption?: string): Promise<BotSendMessageResponse>;
}
