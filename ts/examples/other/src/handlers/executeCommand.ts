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
import changeRole from "./changeRole";
import { ephemeral } from "./ephemeral";
import { chatEvents, communityEvents } from "./events";
import file from "./file";
import image from "./image";
import { chatMembers, communityMembers } from "./members";
import news from "./news";
import numbers from "./numbers";
import poll from "./poll";
import sayHello from "./sayHello";
import subscribe from "./subscribe";
import summary from "./summary";
import unsubscribe from "./unsubscribe";
import userSummary from "./usersummary";

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
        case "user_summary":
            return userSummary(req, res);
        case "chat_members":
            return chatMembers(req, res);
        case "community_members":
            return communityMembers(req, res);
        case "say_hello":
            return sayHello(req, res);
        case "chat_summary":
            return summary(req, res);
        case "ephemeral":
            return ephemeral(req, res);
        case "chat_events":
            return chatEvents(req, res);
        case "community_events":
            return communityEvents(req, res);
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
        case "change_role":
            return changeRole(req, res);

        default:
            res.status(400).send(commandNotFound());
    }
}
