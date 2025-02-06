import type { BotSendMessageArgs, FileContent, ImageContent, TextContent } from "../services/bot_gateway/candid/types";
import type { AuthToken, BlobReference } from "./bot";
type FileMessageContent = {
    File: FileContent;
};
type TextMessageContent = {
    Text: TextContent;
};
type ImageMessageContent = {
    Image: ImageContent;
};
export type MessageResponse<M> = {
    id: bigint;
    content: M;
    finalised: boolean;
    blockLevelMarkdown: boolean;
};
export declare class Message<M> {
    #private;
    protected content: M;
    constructor(content: M);
    setChannelId<T extends Message<M>>(id: number): T;
    setFinalised<T extends Message<M>>(finalised: boolean): T;
    setBlockLevelMarkdown<T extends Message<M>>(blm: boolean): T;
    setMessageId<T extends Message<M>>(messageId?: bigint): T;
    setContextMessageId<T extends Message<M>>(messageId?: bigint): T;
    toResponse(): MessageResponse<M>;
    toInputArgs(auth: AuthToken): BotSendMessageArgs;
}
export declare class TextMessage extends Message<TextMessageContent> {
    constructor(text: string);
}
export declare class ImageMessage extends Message<ImageMessageContent> {
    constructor(width: number, height: number, mimeType: string, blobReference: BlobReference);
    setCaption(caption?: string): ImageMessage;
}
export declare class FileMessage extends Message<FileMessageContent> {
    constructor(name: string, mimeType: string, fileSize: number, blobReference: BlobReference);
    setCaption(caption?: string): FileMessage;
}
export {};
