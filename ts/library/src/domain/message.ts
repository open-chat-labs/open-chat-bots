import {
    apiBlobReference,
    apiBotChatContext,
    apiMiniAppContent,
    apiOptional,
    miniAppContent,
    principalStringToBytes,
    apiPriceChartContent,
    identity,
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
import type { MiniAppContent, MiniAppImage, MiniAppUpdate, PriceChartContent } from "./event";
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

    // The args to edit message `messageId` to this message's text. OpenChat takes only the text, or
    // caption, of the content, which must be of the same type as the message's. The thread, block
    // level markdown and link previews apply; the message's other settings don't.
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

/** The most characters a MiniApp card's text can have */
export const MINI_APP_MAX_TEXT_CHARS = 2_000;

/**
 * A bot's card for an app it hosts, eg. a game: markdown text, under an optional image, with the
 * players, whose move it is or the result, and an Open button, all of which OpenChat draws. It
 * opens the bot's app, which the bot serves at `/app` under its endpoint, in a frame. The text,
 * image, player limit and whether others can watch never change, while the bot keeps the status,
 * players, whose move it is and the result up to date with `BotClient.updateMiniApp`. It needs the
 * MiniApp permission, and can't be sent in a direct chat. Check it with `validate` before sending
 * it.
 *
 * Upload the image first, as `BotClient.createMiniAppMessage` does, so that it's scanned like any
 * image and deleted with the card.
 */
export class MiniAppMessage extends Message {
    constructor(text: string, image?: MiniAppImage) {
        super({
            MiniApp: apiMiniAppContent({
                text,
                image,
                spectators: false,
                spectatorCount: 0,
                status: "open",
                players: [],
            }),
        });
    }

    public get requiredMessagePermissions(): MessagePermission[] {
        return ["MiniApp"];
    }

    get #miniApp(): ApiMiniAppContent {
        return (this.content as { MiniApp: ApiMiniAppContent }).MiniApp;
    }

    /** The most who can play, 1 to 100, so the card can show eg. "2 of 4" */
    setMaxPlayers(maxPlayers?: number): MiniAppMessage {
        this.#miniApp.max_players = maxPlayers;
        return this;
    }

    /** Whether members who aren't playing can open the app once the game has started */
    setSpectators(spectators: boolean): MiniAppMessage {
        this.#miniApp.spectators = spectators;
        return this;
    }

    /** The players' user ids when the card is posted, eg. the member who ran the command */
    setPlayers(players: string[]): MiniAppMessage {
        this.#miniApp.players = players.map(principalStringToBytes);
        return this;
    }

    /** Why OpenChat would refuse this card, with the error it gives, or undefined if it's valid */
    validate(): string | undefined {
        return validateMiniAppContent(miniAppContent(this.#miniApp));
    }
}

/** The most players a card can have */
export const MINI_APP_MAX_PLAYERS = 100;

/** The most characters a finished card's result can have */
export const MINI_APP_MAX_RESULT_CHARS = 200;

/**
 * Checks a MiniApp card as OpenChat does: its text, its image, its player limit and players, whose
 * move it is and its result. Returns the error OpenChat would give, or undefined if it's valid.
 */
export function validateMiniAppContent(content: Omit<MiniAppContent, "kind">): string | undefined {
    const textError = validateMiniAppText(content.text);
    if (textError !== undefined) return textError;
    if (content.image !== undefined) {
        const { width, height, mimeType } = content.image;
        const imageError = validateMiniAppImage(width, height, mimeType);
        if (imageError !== undefined) return imageError;
    }
    const max = content.maxPlayers;
    if (max !== undefined && !(Number.isInteger(max) && max >= 1 && max <= MINI_APP_MAX_PLAYERS)) {
        return `A game has 1 to ${MINI_APP_MAX_PLAYERS} players at most`;
    }
    const limit = max ?? MINI_APP_MAX_PLAYERS;
    if (content.players.length > limit) {
        return `This game has at most ${limit} players`;
    }
    if (new Set(content.players).size < content.players.length) {
        return "A player is listed twice";
    }
    if (content.spectatorCount > 0 && !content.spectators) {
        return "Only a game open to spectators has any";
    }
    if ((content.waitingFor ?? []).some((user) => !content.players.includes(user))) {
        return "Only players can be waited for";
    }
    if (content.result !== undefined) {
        if (content.status !== "finished") {
            return "Only a finished game has a result";
        }
        if (!hasChars(content.result, MINI_APP_MAX_RESULT_CHARS)) {
            return `The result must have 1 to ${MINI_APP_MAX_RESULT_CHARS} characters`;
        }
    }
    return undefined;
}

/**
 * The card as OpenChat leaves it after `update`, eg. to `validateMiniAppContent` an update before
 * sending it. OpenChat also refuses any update of a finished card.
 */
export function applyMiniAppUpdate<T extends Omit<MiniAppContent, "kind">>(
    content: T,
    update: MiniAppUpdate,
): T {
    return {
        ...content,
        status: update.status ?? content.status,
        players: update.players ?? content.players,
        spectatorCount: update.spectatorCount ?? content.spectatorCount,
        waitingFor:
            update.waitingFor === undefined ? content.waitingFor : (update.waitingFor ?? undefined),
        result: update.result === undefined ? content.result : (update.result ?? undefined),
    };
}

/**
 * Checks a MiniApp card's text as OpenChat does: not blank, and at most 2,000 characters. Returns
 * the error OpenChat would give, or undefined if it's valid.
 */
export function validateMiniAppText(text: string): string | undefined {
    if (!hasChars(text, MINI_APP_MAX_TEXT_CHARS)) {
        return `The text must have 1 to ${MINI_APP_MAX_TEXT_CHARS} characters`;
    }
    return undefined;
}

// As OpenChat checks text: not blank, and at most `max` characters, counted in code points, as
// OpenChat counts Rust's chars
function hasChars(text: string, max: number): boolean {
    return text.trim().length > 0 && [...text].length <= max;
}

/**
 * Checks a MiniApp card's image as OpenChat does: it has a width and a height, and an image's mime
 * type. Returns the error OpenChat would give, or undefined if it's valid.
 */
export function validateMiniAppImage(
    width: number,
    height: number,
    mimeType: string,
): string | undefined {
    if (!(width > 0) || !(height > 0)) {
        return "The image must have a width and a height";
    }
    if (!mimeType.startsWith("image/")) {
        return "The image's mime type must be an image's";
    }
    return undefined;
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
