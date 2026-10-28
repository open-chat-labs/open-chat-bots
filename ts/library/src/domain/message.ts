import {
    apiBlobReference,
    apiBotChatContext,
    apiMiniAppContent,
    apiOptional,
    apiPriceChartContent,
    identity,
    miniAppContent,
} from "../mapping";
import type {
    LocalUserIndexBotEditMessageArgs as BotEditMessageArgs,
    LocalUserIndexBotSendMessageArgs as BotSendMessageArgs,
    FileContent,
    ImageContent,
    BotMessageContent as MessageContent,
    MiniAppContent as ApiMiniAppContent,
    OgPreview,
    PollContent,
} from "../typebox/typebox";
import { random64 } from "../utils/rng";
import type { BotChatContext } from "./bot";
import type { BlobReference } from "./data";
import type { MiniAppContent, PriceChartContent } from "./event";
import type { MessagePermission } from "./permissions";

type FileMessageContent = { File: FileContent };
type PollMessageContent = { Poll: PollContent };
type ImageMessageContent = { Image: ImageContent };
type MiniAppMessageContent = { MiniApp: ApiMiniAppContent };

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
    // Note this distinction is client-side only - OpenChat collapses an absent field and an
    // empty list to the same thing, so both end up sending no previews.
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

    // The args to replace message `messageId`'s content with this message's. Only its content,
    // thread, block level markdown and link previews apply to an edit.
    toEditArgs(
        ctx: BotChatContext,
        messageId: bigint,
        ogPreviews?: OgPreview[],
    ): BotEditMessageArgs {
        return {
            chat_context: apiBotChatContext(ctx),
            thread: apiOptional(this.#thread, identity),
            message_id: messageId,
            content: this.content as MessageContent,
            block_level_markdown: this.#blockLevelMarkdown,
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

/**
 * A chart of token prices, which OpenChat draws so that readers can see the price at any time.
 * OpenChat refuses a chart with a title over 100 characters, more than 5 series, more than 1,000
 * points across all the series or more than 3 sources.
 */
export class PriceChartMessage extends Message {
    constructor(chart: Omit<PriceChartContent, "kind">) {
        super({ PriceChart: apiPriceChartContent(chart) });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["Image"];
    }
}

/**
 * A message a bot keeps up to date while something it runs goes on, eg. a game's lobby or board:
 * markdown text with rows of buttons. The website sends each press of a button to the bot's
 * `/execute_action` endpoint (see `ActionHandlerRegistry`), and the bot edits the message to show
 * what changed. It needs the MiniApp permission, to send it and, autonomously, to edit it. It can't
 * be sent in a direct chat. OpenChat refuses content beyond `MiniAppLimits`, so check it with
 * `validate` first.
 */
export class MiniAppMessage extends Message {
    constructor(miniApp: Omit<MiniAppContent, "kind">) {
        super({ MiniApp: apiMiniAppContent(miniApp) });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["MiniApp"];
    }

    /** Why OpenChat would refuse this content, with the error it gives, or undefined if it's valid */
    validate(): string | undefined {
        return validateMiniAppContent(
            miniAppContent((this.content as MiniAppMessageContent).MiniApp),
        );
    }
}

/** The limits OpenChat enforces on a MiniApp message's content */
export const MiniAppLimits = {
    MAX_TEXT_CHARS: 2_000,
    MAX_ROWS: 5,
    MAX_BUTTONS_PER_ROW: 5,
    MAX_ID_BYTES: 64,
    MAX_LABEL_CHARS: 40,
    MAX_VISIBLE_TO: 100,
} as const;

/**
 * Checks MiniApp content against the limits OpenChat enforces, so that a mistake shows up before
 * it's sent. Returns the error OpenChat would give, or undefined if the content is valid.
 */
export function validateMiniAppContent(content: Omit<MiniAppContent, "kind">): string | undefined {
    const textError = checkChars("text", content.text, MiniAppLimits.MAX_TEXT_CHARS);
    if (textError !== undefined) return textError;
    if (content.buttonRows.length > MiniAppLimits.MAX_ROWS) {
        return `A message has at most ${MiniAppLimits.MAX_ROWS} rows of buttons`;
    }
    const ids = new Set<string>();
    for (const row of content.buttonRows) {
        if (row.length === 0 || row.length > MiniAppLimits.MAX_BUTTONS_PER_ROW) {
            return `A row has 1 to ${MiniAppLimits.MAX_BUTTONS_PER_ROW} buttons`;
        }
        for (const button of row) {
            const idBytes = utf8Length(button.id);
            if (idBytes === 0 || idBytes > MiniAppLimits.MAX_ID_BYTES) {
                return `A button's id has 1 to ${MiniAppLimits.MAX_ID_BYTES} bytes`;
            }
            if (ids.has(button.id)) {
                return `Two buttons have the id ${button.id}`;
            }
            ids.add(button.id);
            const labelError = checkChars(
                "button label",
                button.label,
                MiniAppLimits.MAX_LABEL_CHARS,
            );
            if (labelError !== undefined) return labelError;
            if ((button.visibleTo?.length ?? 0) > MiniAppLimits.MAX_VISIBLE_TO) {
                return `A button is shown to at most ${MiniAppLimits.MAX_VISIBLE_TO} users`;
            }
        }
    }
    return undefined;
}

// As OpenChat checks text: not blank, and at most `max` characters (code points, as Rust counts)
function checkChars(field: string, value: string, max: number): string | undefined {
    if (value.trim().length === 0 || [...value].length > max) {
        return `The ${field} must have 1 to ${max} characters`;
    }
    return undefined;
}

function utf8Length(value: string): number {
    return new TextEncoder().encode(value).length;
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
