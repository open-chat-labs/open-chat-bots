import {
    BotClient,
    BotEvent,
    handleNotification,
    MessageContent,
    MessageEvent,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";

export async function notify(req: Request, res: Response) {
    handleNotification(
        req.headers["x-oc-signature"] as string,
        req.body as Buffer,
        factory,
        async (client: BotClient, ev: BotEvent) => {
            console.log("Event: ", JSON.stringify(ev));
            if (ev.kind === "bot_chat_event" && ev.event.kind === "message") {
                console.log("Message received: ", ev.event);
                handleTextMessage(client, ev.event as MessageEvent<MessageContent>);
            }
            res.status(200).json({});
        },
        (err) => {
            res.status(500).json({ error: err });
        },
    );
}

async function handleTextMessage(client: BotClient, message: MessageEvent<MessageContent>) {
    console.log("Message received: ", message);
}
