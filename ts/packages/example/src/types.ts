import {
  BotApiKeyChatClient,
  BotCommandChatClient,
} from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithCommandChatClient extends Request {
  botClient: BotCommandChatClient;
}

export interface WithApiKeyChatClient extends Request {
  botClient: BotApiKeyChatClient;
}
