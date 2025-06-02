import {
  ChatActionScope,
  parseBotNotification,
  Permissions,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";
import react from "./react";

export async function notify(req: Request, res: Response) {
  console.log("Got a notification, ", JSON.stringify(req.body));
  const result = parseBotNotification(req.body);
  console.log("Parsed as: ", result);
  if (result.kind === "bot_event_wrapper") {
    if (
      result.event.kind === "bot_chat_event" &&
      result.event.eventType === "message"
    ) {
      const scope = new ChatActionScope(result.event.chatId);
      const client = factory.createClientInAutonomouseContext(
        scope,
        result.apiGateway,
        new Permissions(
          Permissions.encodePermissions({
            community: [],
            chat: ["ReactToMessages"],
            message: [],
          })
        )
      );
      react(client, result.event.eventIndex, req, res);
    }
  }
  res.status(200).json({});
}
