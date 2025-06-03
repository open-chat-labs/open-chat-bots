/**
 * This route handler serves the purpose of a command router. It will retrieve the commandName from the BotClient
 * (which is attached to the request), and then uses it to route to the specific handler for the relevant command.
 *
 * For commentary on what an example command does, look in the album.js file which is commented to explain its steps.
 *
 * Other commands in this sample follow a similar pattern.
 */
import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { WithBotClient } from "../types";
import events from "./events";
import file from "./file";
import image from "./image";
import news from "./news";
import numbers from "./numbers";
import poll from "./poll";
import sayHello from "./sayHello";
import subscribe from "./subscribe";
import summary from "./summary";
import unsubscribe from "./unsubscribe";

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
    case "say_hello":
      return sayHello(req, res);
    case "chat_summary":
      return summary(req, res);
    case "chat_events":
      return events(req, res);
    case "prompt":
    case "numbers":
      return numbers(req, res);
    case "poll":
      return poll(req, res);
    case "subscribe":
      return subscribe(req, res);
    case "unsubscribe":
      return unsubscribe(req, res);
    case "file":
      return file(req, res);
    case "news":
      return news(req, res);
    case "image":
      return image(req, res);

    default:
      res.status(400).send(commandNotFound());
  }
}
