import { BotClient } from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithBotClient extends Request {
  botClient: BotClient;
}
