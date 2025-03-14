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
import prompt from "./prompt";
import imagine from "./imagine";
import subscribe from "./subscribe";
import syncApiKey from "./syncApiKey";
import unsubscribe from "./unsubscribe";
import { WithBotClient } from "../types";
import poll from "./poll";
import numbers from "./numbers";
import details from "./details";
import events from "./events";

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
        case "sync_api_key":
            return syncApiKey(req, res);
        case "chat_details":
            return details(req, res);
        case "chat_events":
            return events(req, res);
        case "prompt":
            return prompt(req, res);
        case "imagine":
            return imagine(req, res);
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
