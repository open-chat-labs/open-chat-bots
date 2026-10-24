import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { WithBotClient } from "../types";
import ask from "./ask";

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
    case "ask":
      return ask(req as WithBotClient, res);
    default:
      res.status(400).send(commandNotFound());
  }
}
