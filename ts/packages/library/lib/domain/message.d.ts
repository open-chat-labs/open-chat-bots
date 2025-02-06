import type { BotSendMessageArgs, MessageContent } from "../services/bot_gateway/candid/types";
import type { AuthToken, BlobReference } from "./bot";
export type MessageResponse = {
    id: bigint;
    content: MessageContent;
    finalised: boolean;
    blockLevelMarkdown: boolean;
};
export declare class Message {
    #private;
    protected content: MessageContent;
    constructor(content: MessageContent);
    setChannelId<T extends Message>(id: number): T;
    setFinalised<T extends Message>(finalised: boolean): T;
    setBlockLevelMarkdown<T extends Message>(blm: boolean): T;
    setMessageId<T extends Message>(messageId?: bigint): T;
    setContextMessageId<T extends Message>(messageId?: bigint): T;
    toResponse(): MessageResponse;
    toInputArgs(auth: AuthToken): BotSendMessageArgs;
}
export declare class TextMessage extends Message {
    constructor(text: string);
}
export declare class ImageMessage extends Message {
    constructor(width: number, height: number, mimeType: string, blobReference: BlobReference);
    setCaption(caption?: string): ImageMessage;
}
export declare class FileMessage extends Message {
    constructor(name: string, mimeType: string, fileSize: number, blobReference: BlobReference);
    setCaption(caption?: string): FileMessage;
}
export type PollDuration = "oneHour" | "oneDay" | "oneWeek";
export declare class PollMessage extends Message {
    constructor(question: string, answers: string[], duration?: PollDuration);
    setAllowMultipleVotesPerUser(val: boolean): PollMessage;
    setShowVotesBeforeEndDate(val: boolean): PollMessage;
    setAnonymous(val: boolean): PollMessage;
    setAllowUsersToChangeVote(val: boolean): PollMessage;
}
