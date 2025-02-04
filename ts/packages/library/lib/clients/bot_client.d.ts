import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../utils/candidService";
import type { AuthToken, BotActionChatScope, BotActionCommunityScope, BotActionScope, BotClientConfig, BotCommand, BotCommandArg, Message } from "../types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import type { Chat } from "../services/storageIndex/candid/types";
export declare class BotClient extends CandidService {
    #private;
    constructor(agent: HttpAgent, env: BotClientConfig, auth: AuthToken);
    get command(): BotCommand | undefined;
    sendMessage(message: Message): Promise<BotSendMessageResponse>;
    get scope(): BotActionScope;
    get chatScope(): BotActionChatScope | undefined;
    get communityScope(): BotActionCommunityScope | undefined;
    get messageId(): bigint | undefined;
    stringArg(name: string): string | undefined;
    booleanArg(name: string): boolean | undefined;
    numberArg(name: string): number | undefined;
    userArg(name: string): string | undefined;
    get threadRootMessageId(): number | undefined | null;
    get chatId(): Chat | undefined;
    get botId(): string;
    get commandArgs(): BotCommandArg[];
    get commandName(): string | undefined;
    get initiator(): string | undefined;
    sendTextMessage(finalised: boolean, text: string, blockLevelMarkdown?: boolean): Promise<BotSendMessageResponse>;
    createTextMessage(finalised: boolean, text: string, blockLevelMarkdown?: boolean): Promise<Message>;
    createImageMessage(finalised: boolean, imageData: Uint8Array, mimeType: string, width: number, height: number, caption?: string): Promise<Message>;
    sendImageMessage(finalised: boolean, imageData: Uint8Array, mimeType: string, width: number, height: number, caption?: string): Promise<BotSendMessageResponse>;
    createFileMessage(finalised: boolean, name: string, data: Uint8Array, mimeType: string, fileSize: number, caption?: string): Promise<Message>;
    sendFileMessage(finalised: boolean, name: string, data: Uint8Array, mimeType: string, fileSize: number, caption?: string): Promise<BotSendMessageResponse>;
}
export declare function isChatScope(scope: BotActionScope): scope is BotActionChatScope;
export declare function isCommunityScope(scope: BotActionScope): scope is BotActionCommunityScope;
