import {
    BotClient,
    BotEvent,
    handleNotification,
    MessageContent,
    MessageEvent,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";
import { executePlan, getPlan, removePlan } from "../services/planStore";

export async function notify(req: Request, res: Response) {
    handleNotification(
        req.headers["x-oc-signature"] as string,
        req.body as Buffer,
        factory,
        async (client: BotClient, ev: BotEvent) => {
            if (ev.kind === "bot_chat_event" && ev.event.kind === "message") {
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
    // This kind of sucks - it means we have to try to find a plan for every message in every chat in this community
    // We should ensure that plans are stored in memory and only looked up from the db when the service starts
    const plan = await getPlan(message.messageId);
    if (plan !== undefined) {
        // make sure that the initiator of this plan has approved it
        const approval = message.reactions.find(
            (r) => r.reaction === "👍️" && r.userIds.has(plan.proposedBy),
        );
        const rejection = message.reactions.find(
            (r) => r.reaction === "👎" && r.userIds.has(plan.proposedBy),
        );
        if (rejection !== undefined) {
            await removePlan(message.messageId);
        } else if (approval !== undefined) {
            await executePlan(client, plan);
            await removePlan(message.messageId);
        }
    }
}
