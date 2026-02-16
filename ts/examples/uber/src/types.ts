import { BotClient } from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithBotClient extends Request {
    botClient: BotClient;
}

export interface ChatMessage {
    sender: string;
    text: string;
    timestamp: bigint;
    messageIndex: number;
    messageId: bigint;
    eventIndex: number;
}
