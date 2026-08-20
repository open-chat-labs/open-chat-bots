import { apiBlobReference, apiBotChatContext, apiOptional, identity } from "../mapping";
import type {
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    FileContent,
    ImageContent,
    BotMessageContent as MessageContent,
    OgPreview,
    PollContent,
} from "../typebox/typebox";
import { random64 } from "../utils/rng";
import type { BotChatContext } from "./bot";
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
    #channelId?: bigint;
    #messageId?: bigint;
    #repliesTo?: number;
    #thread?: number;
    #contextMessageId?: bigint;
    #finalised: boolean = true;
    #blockLevelMarkdown: boolean = false;
    #ephemeral: boolean = false;
    // undefined means "not specified" which allows the client to fetch previews automatically.
    // An empty array means "explicitly no previews" and suppresses the automatic fetch.
    #ogPreviews?: OgPreview[];

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

    get channelId() {
        return this.#channelId;
    }

    setChannelId<T extends Message>(id: bigint): T {
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

    /**
     * Sets the OpenGraph link previews to attach to this message. Setting this - to a populated
     * list *or* to an empty list - disables the client's automatic preview lookup, so passing []
     * is how you explicitly suppress previews for a single message.
     */
    setOgPreviews<T extends Message>(previews: OgPreview[]): T {
        this.#ogPreviews = previews;
        return this as unknown as T;
    }

    /** The previews explicitly set on this message, or undefined if none were set. */
    public get ogPreviews(): OgPreview[] | undefined {
        return this.#ogPreviews;
    }

    /** The text of this message, if it is a text message. Used to find links to preview. */
    public get text(): string | undefined {
        return "Text" in this.content ? this.content.Text.text : undefined;
    }

    setMessageId<T extends Message>(messageId?: bigint): T {
        this.#messageId = messageId;
        return this as unknown as T;
    }

    setThread<T extends Message>(thread?: number): T {
        this.#thread = thread;
        return this as unknown as T;
    }

    setRepliesTo<T extends Message>(repliesTo?: number): T {
        this.#repliesTo = repliesTo;
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

    // ogPreviews are passed in rather than fetched here because this method is synchronous and
    // the automatic lookup is async. Anything explicitly set on the message always wins.
    toInputArgs(ctx: BotChatContext, ogPreviews?: OgPreview[]): BotSendMessageArgs {
        return {
            chat_context: apiBotChatContext(ctx),
            message_id: apiOptional(this.#messageId, identity),
            thread: apiOptional(this.#thread, identity),
            replies_to: apiOptional(this.#repliesTo, identity),
            content: this.content as MessageContent,
            finalised: this.#finalised,
            block_level_markdown: this.#blockLevelMarkdown ?? false,
            og_previews: this.#ogPreviews ?? ogPreviews,
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
