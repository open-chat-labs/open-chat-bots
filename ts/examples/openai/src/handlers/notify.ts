import {
  BotClient,
  BotEvent,
  handleNotification,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";
import { ModeratableContent } from "../types";
import { chatModerate, platformModerate } from "./moderate";
import react from "./react";

export async function notify(req: Request, res: Response) {
  handleNotification(
    req.body,
    factory,
    async (client: BotClient, ev: BotEvent) => {
      if (ev.kind === "bot_chat_event" && ev.eventType === "message") {
        const eventIndex = ev.eventIndex;
        const resp = await client.chatEvents({
          kind: "chat_events_by_index",
          eventIndexes: [eventIndex],
        });
        if (
          resp.kind === "success" &&
          resp.events[0].event.kind === "message" &&
          (resp.events[0].event.content.kind === "text_content" ||
            resp.events[0].event.content.kind === "image_content")
        ) {
          handleTextMessage(client, resp.events[0].event as ModeratableContent);
        }
      }
      res.status(200).json({});
    },
    (err) => {
      res.status(500).json({ error: err });
    }
  );
}

async function handleTextMessage(
  client: BotClient,
  message: ModeratableContent
) {
  const breaksPlatformRules = await platformModerate(client, message);
  if (!breaksPlatformRules) {
    const breaksChatRules = await chatModerate(client, message);
    if (!breaksChatRules) {
      react(client, message);
    }
  }
}
