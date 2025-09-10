import {
    BotClient,
    BotEventWrapper,
    ImageContent,
    MessageEvent,
    TextContent,
} from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithBotClient extends Request {
    botClient: BotClient;
}

export interface WithBotEvent extends WithBotClient {
    botClient: BotClient;
    botEventWrapper: BotEventWrapper;
}

export type ModeratableContent = MessageEvent<TextContent> | MessageEvent<ImageContent>;
