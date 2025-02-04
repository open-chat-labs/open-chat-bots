import {
  ApiKeyBotChatClient,
  CommandBotChatClient,
} from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithCommandChatClient extends Request {
  botClient: CommandBotChatClient;
}

export interface WithApiKeyChatClient extends Request {
  botClient: ApiKeyBotChatClient;
}
