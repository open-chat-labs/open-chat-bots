import { Request, Response } from "express";
import { WithBotClient } from "../types";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

export default async function deleteChannel(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }

  const client = req.botClient;
  const channelId = BigInt(req.body);
  const resp = await client.deleteChannel(channelId);

  if (resp.kind === "success") {
    console.log("Successfully deleted channel", channelId);
    res.sendStatus(200);
  } else {
    res.status(500).json(resp);
  }
}
