import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { WithBotClient } from "../types";
import news from "./news";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

export default function executeCommand(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }
  const client = req.botClient;

  switch (client.commandName) {
    case "news":
      return news(req, res);

    default:
      res.status(400).send(commandNotFound());
  }
}
