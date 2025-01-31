import { Request, Response } from "express";
import { WithApiKeyChatClient } from "../types";
import { success } from "./success";

function hasBotClient(req: Request): req is WithApiKeyChatClient {
  return (req as WithApiKeyChatClient).botClient !== undefined;
}

export default async function executeAction(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }

  const client = req.botClient;

  const msg = await client.createTextMessage(true, req.body);

  res.status(200).json(success(msg));
  client
    .sendMessage(msg)
    .catch((err: unknown) => console.error("sendMessage failed with: ", err));
}
