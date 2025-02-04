/**
 * This route handler serves the purpose of a command router. It will retrieve the commandName from the BotClient
 * (which is attached to the request), and then uses it to route to the specific handler for the relevant command.
 *
 * For commentary on what an example command does, look in the album.js file which is commented to explain its steps.
 *
 * Other commands in this sample follow a similar pattern.
 */
import { Request, Response } from "express";
import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import artist from "./artist";
import album from "./album";
import song from "./song";
import image from "./image";
import file from "./file";
import news from "./news";
import start_ping from "./start_ping";
import stop_ping from "./stop_ping";
import { WithBotClient } from "../types";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

export default function executeCommand(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }
  const client = req.botClient;
  console.log("Command: ", client.commandName, client.commandArgs);

  switch (client.commandName) {
    case "start_ping":
      return start_ping(req, res);
    case "stop_ping":
      return stop_ping(req, res);
    case "file":
      return file(req, res);
    case "news":
      return news(req, res);
    case "image":
      return image(req, res);
    case "song":
      return song(req, res);
    case "artist":
      return artist(req, res);
    case "album":
      return album(req, res);

    default:
      res.status(400).send(commandNotFound());
  }
}
