import {
  BotClient,
  ImageContent,
  MessageEvent,
  TextContent,
} from "@open-ic/openchat-botclient-ts";
import { Request } from "express";

export interface WithBotClient extends Request {
  botClient: BotClient;
}

export type ModeratableContent =
  | MessageEvent<TextContent>
  | MessageEvent<ImageContent>;
