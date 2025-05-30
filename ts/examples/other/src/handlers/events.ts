import { Response } from "express";
import { success } from "./success";
import { WithBotClient } from "../types";
import {
    ChatDetailsSuccess,
    ChatEventsSuccess,
    Message,
    MessageEvent,
    type BotClient,
} from "@open-ic/openchat-botclient-ts";

async function ephemeralMsg(client: BotClient, txt: string): Promise<Message> {
    const msg = (await client.createTextMessage(txt))
        .makeEphemeral()
        .setFinalised(true);
    return msg;
}

export default async function (req: WithBotClient, res: Response) {
    const client = req.botClient;
    if (client.chatScope === undefined) {
        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "Commandcan only be run in a chat scope",
                ),
            ),
        );
        return;
    }
    const resp = await client.chatDetails();
    if (resp.kind !== "success") {
        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "Unable to to load the chat details",
                ),
            ),
        );
        return;
    }

    const eventsResp = await client.chatEvents({
        kind: "chat_events_page",
        maxEvents: 50,
        maxMessages: 50,
        startEventIndex: resp.latestEventIndex,
        ascending: false,
    });
    if (eventsResp.kind !== "success") {
        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "Unable to load the events for the chat",
                ),
            ),
        );
        return;
    }
    const msg = createEventsMessage(eventsResp);
    const details = (await client.createTextMessage(msg)).setFinalised(true);
    client
        .sendMessage(details)
        .catch((err) => console.error("sendMessage failed with: ", err));
    res.status(200).json(success(details));
}

// writes out the message text for all of the text content messages
function createEventsMessage(resp: ChatEventsSuccess): string {
    const msgs: string[] = [];
    resp.events.forEach((ev) => {
        if (
            ev.event.kind === "message" &&
            ev.event.content.kind === "text_content"
        ) {
            msgs.push(ev.event.content.text);
            msgs.push(`Sent by: @UserId(${ev.event.sender})`);
            msgs.push("=================================\n\n");
        }
    });
    return msgs.join("\n");
}
