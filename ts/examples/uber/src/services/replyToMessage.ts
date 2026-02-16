import { BotClient } from "@open-ic/openchat-botclient-ts";

export async function replyToMessage(
    client: BotClient,
    eventIndex: number,
    message: string,
    // thread?: number,
): Promise<"success" | "failure"> {
    try {
        let msg = await client.createTextMessage(message);
        msg = msg.setRepliesTo(eventIndex);
        // if (thread !== undefined) {
        //     msg = msg.setThread(thread);
        // }
        const resp = await client.sendMessage(msg);
        if (resp.kind === "success") {
            return "success";
        } else {
            return "failure";
        }
    } catch (error) {
        console.error("Error adding reply message", error);
        return "failure";
    }
}
