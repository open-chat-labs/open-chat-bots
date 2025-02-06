import { apiAuthToken, apiBlobReference, apiOptional, identity } from "../mapping";
import type {
    AudioContent,
    BotSendMessageArgs,
    FileContent,
    GiphyContent,
    ImageContent,
    PollContent,
    TextContent,
    VideoContent,
} from "../services/bot_gateway/candid/types";
import type { AuthToken, BlobReference } from "./bot";

type MessageContent =
    | GiphyMessageContent
    | FileMessageContent
    | PollMessageContent
    | TextMessageContent
    | ImageMessageContent
    | AudioMessageContent
    | VideoMessageContent;

type GiphyMessageContent = { Giphy: GiphyContent };
type FileMessageContent = { File: FileContent };
type PollMessageContent = { Poll: PollContent };
type TextMessageContent = { Text: TextContent };
type ImageMessageContent = { Image: ImageContent };
type AudioMessageContent = { Audio: AudioContent };
type VideoMessageContent = { Video: VideoContent };

export type MessageResponse<M> = {
    id: bigint;
    content: M;
    finalised: boolean;
    blockLevelMarkdown: boolean;
};

export class Message<M> {
    #channelId?: number;
    #messageId?: bigint;
    #contextMessageId?: bigint;
    #finalised: boolean = true;
    #blockLevelMarkdown: boolean = false;
    protected content: M;

    constructor(content: M) {
        this.content = content;
    }

    setChannelId<T extends Message<M>>(id: number): T {
        this.#channelId = id;
        return this as unknown as T;
    }

    setFinalised<T extends Message<M>>(finalised: boolean): T {
        this.#finalised = finalised;
        return this as unknown as T;
    }

    setBlockLevelMarkdown<T extends Message<M>>(blm: boolean): T {
        this.#blockLevelMarkdown = blm;
        return this as unknown as T;
    }

    setMessageId<T extends Message<M>>(messageId?: bigint): T {
        this.#messageId = messageId;
        return this as unknown as T;
    }

    setContextMessageId<T extends Message<M>>(messageId?: bigint): T {
        this.#contextMessageId = messageId;
        return this as unknown as T;
    }

    toResponse(): MessageResponse<M> {
        return {
            id: this.#contextMessageId ?? 0n,
            content: this.content,
            finalised: this.#finalised,
            blockLevelMarkdown: this.#blockLevelMarkdown,
        };
    }

    toInputArgs(auth: AuthToken): BotSendMessageArgs {
        return {
            channel_id: apiOptional(this.#channelId, identity),
            message_id: apiOptional(this.#messageId, identity),
            content: this.content as MessageContent,
            finalised: this.#finalised,
            block_level_markdown: this.#blockLevelMarkdown ?? false,
            auth_token: apiAuthToken(auth),
        };
    }
}

export class TextMessage extends Message<TextMessageContent> {
    constructor(text: string) {
        super({ Text: { text } });
    }
}

export class ImageMessage extends Message<ImageMessageContent> {
    constructor(width: number, height: number, mimeType: string, blobReference: BlobReference) {
        super({
            Image: {
                height,
                mime_type: mimeType,
                blob_reference: apiOptional(blobReference, apiBlobReference),
                thumbnail_data: "",
                caption: [],
                width,
            },
        });
    }

    setCaption(caption?: string): ImageMessage {
        this.content.Image.caption = apiOptional(caption, identity);
        return this;
    }
}

export class FileMessage extends Message<FileMessageContent> {
    constructor(name: string, mimeType: string, fileSize: number, blobReference: BlobReference) {
        super({
            File: {
                name,
                file_size: fileSize,
                mime_type: mimeType,
                blob_reference: apiOptional(blobReference, apiBlobReference),
                caption: [],
            },
        });
    }

    setCaption(caption?: string): FileMessage {
        this.content.File.caption = apiOptional(caption, identity);
        return this;
    }
}
