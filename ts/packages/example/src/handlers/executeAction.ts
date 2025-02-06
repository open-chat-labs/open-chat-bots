import { Request, Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

export default async function executeAction(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }

  const client = req.botClient;

  const msg = await client.createTextMessage(req.body);

  res.status(200).json(success(msg));
  client
    .sendMessage(msg)
    .catch((err: unknown) => console.error("sendMessage failed with: ", err));
}
