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
}

export interface ScheduleConfig {
    messageCount: number;
    frequency: "daily" | "weekly" | "interval";
    time?: string; // 24-hour format: "09:00"
    dayOfWeek?: number; // 0-6 for weekly (0=Sunday)
    intervalHours?: number; // for interval-based
}
