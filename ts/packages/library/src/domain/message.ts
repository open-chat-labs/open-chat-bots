import { apiAuthToken, apiBlobReference, apiOptional, identity } from "../mapping";
import type {
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    FileContent,
    ImageContent,
    BotMessageContent as MessageContent,
    PollContent,
} from "../typebox/typebox";
import { random64 } from "../utils/rng";
import type { AuthToken } from "./bot";
import type { BlobReference } from "./data";
import type { MessagePermission } from "./permissions";

type FileMessageContent = { File: FileContent };
type PollMessageContent = { Poll: PollContent };
type ImageMessageContent = { Image: ImageContent };

export type MessageResponse = {
    id: bigint;
    content: MessageContent;
    finalised: boolean;
    block_level_markdown: boolean;
    ephemeral: boolean;
};

export abstract class Message {
    #channelId?: number;
    #messageId?: bigint;
    #contextMessageId?: bigint;
    #finalised: boolean = true;
    #blockLevelMarkdown: boolean = false;
    #ephemeral: boolean = false;

    protected content: MessageContent;

    abstract get requiredMessagePermissions(): MessagePermission[];

    constructor(content: MessageContent) {
        this.content = content;
    }

    makeEphemeral<T extends Message>(): T {
        this.#ephemeral = true;
        return this.setFinalised(true).setContextMessageId(random64());
    }

    public get isEphemeral(): boolean {
        return this.#ephemeral;
    }

    setChannelId<T extends Message>(id: number): T {
        this.#channelId = id;
        return this as unknown as T;
    }

    setFinalised<T extends Message>(finalised: boolean): T {
        this.#finalised = finalised;
        return this as unknown as T;
    }

    setBlockLevelMarkdown<T extends Message>(blm: boolean): T {
        this.#blockLevelMarkdown = blm;
        return this as unknown as T;
    }

    setMessageId<T extends Message>(messageId?: bigint): T {
        this.#messageId = messageId;
        return this as unknown as T;
    }

    setContextMessageId<T extends Message>(messageId?: bigint): T {
        this.#contextMessageId = messageId;
        return this as unknown as T;
    }

    toResponse(): MessageResponse {
        return {
            id: this.#contextMessageId ?? 0n,
            content: this.content,
            finalised: this.#finalised,
            block_level_markdown: this.#blockLevelMarkdown,
            ephemeral: this.#ephemeral,
        };
    }

    toInputArgs(auth: AuthToken): BotSendMessageArgs {
        return {
            channel_id: apiOptional(this.#channelId, BigInt),
            message_id: apiOptional(this.#messageId, identity),
            content: this.content as MessageContent,
            finalised: this.#finalised,
            block_level_markdown: this.#blockLevelMarkdown ?? false,
            auth_token: apiAuthToken(auth),
        };
    }
}

export class TextMessage extends Message {
    constructor(text: string) {
        super({ Text: { text } });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["Text"];
    }
}

export class ImageMessage extends Message {
    constructor(width: number, height: number, mimeType: string, blobReference: BlobReference) {
        super({
            Image: {
                height,
                mime_type: mimeType,
                blob_reference: apiOptional(blobReference, apiBlobReference),
                thumbnail_data: "",
                width,
            },
        });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["Image"];
    }

    setCaption(caption?: string): ImageMessage {
        (this.content as ImageMessageContent).Image.caption = apiOptional(caption, identity);
        return this;
    }
}

export class FileMessage extends Message {
    constructor(name: string, mimeType: string, fileSize: number, blobReference: BlobReference) {
        super({
            File: {
                name,
                file_size: fileSize,
                mime_type: mimeType,
                blob_reference: apiOptional(blobReference, apiBlobReference),
            },
        });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["File"];
    }

    setCaption(caption?: string): FileMessage {
        (this.content as FileMessageContent).File.caption = apiOptional(caption, identity);
        return this;
    }
}

export type PollDuration = "oneHour" | "oneDay" | "oneWeek";
const ONE_HOUR = 1000 * 60 * 60;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = ONE_DAY * 7;

function pollEndDate(duration: PollDuration) {
    const now = Date.now();
    switch (duration) {
        case "oneHour":
            return BigInt(now + ONE_HOUR);
        case "oneDay":
            return BigInt(now + ONE_DAY);
        case "oneWeek":
            return BigInt(now + ONE_WEEK);
    }
}

export class PollMessage extends Message {
    constructor(question: string, answers: string[], duration: PollDuration = "oneDay") {
        super({
            Poll: {
                votes: {
                    total: { Hidden: 0 },
                    user: [],
                },
                ended: false,
                config: {
                    text: apiOptional(question, identity),
                    allow_multiple_votes_per_user: false,
                    show_votes_before_end_date: true,
                    end_date: apiOptional(pollEndDate(duration), identity),
                    anonymous: false,
                    allow_user_to_change_vote: true,
                    options: answers,
                },
            },
        });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["Poll"];
    }

    setAllowMultipleVotesPerUser(val: boolean): PollMessage {
        (this.content as PollMessageContent).Poll.config.allow_multiple_votes_per_user = val;
        return this;
    }

    setShowVotesBeforeEndDate(val: boolean): PollMessage {
        (this.content as PollMessageContent).Poll.config.show_votes_before_end_date = val;
        return this;
    }

    setAnonymous(val: boolean): PollMessage {
        (this.content as PollMessageContent).Poll.config.anonymous = val;
        return this;
    }

    setAllowUsersToChangeVote(val: boolean): PollMessage {
        (this.content as PollMessageContent).Poll.config.allow_user_to_change_vote = val;
        return this;
    }
}
