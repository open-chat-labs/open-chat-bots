import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { DigestScheduler } from "../services/scheduler";
import { WithBotClient } from "../types";
import schedule from "./schedule";
import summarise from "./summarise";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

export default function executeCommand(scheduler: DigestScheduler) {
  return (req: Request, res: Response) => {
    if (!hasBotClient(req)) {
      res.status(500).send("Bot client not initialised");
      return;
    }
    const client = req.botClient;

    switch (client.commandName) {
      case "summarise":
        return summarise(req, res);

      case "schedule":
        return schedule(req, res, scheduler);

      default:
        res.status(400).send(commandNotFound());
    }
  };
}
