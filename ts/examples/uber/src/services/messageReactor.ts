import { BotClient } from "@open-ic/openchat-botclient-ts";

export async function reactToMessage(
    client: BotClient,
    messageId: bigint,
    reaction: string,
): Promise<"success" | "failure"> {
    try {
        await client.addReaction(messageId, reaction);
        return "success";
    } catch (error) {
        console.error("Error reacting to message", error);
        return "failure";
    }
}

export async function reactToMessages(
    client: BotClient,
    messageIds: bigint[],
    reaction: string,
): Promise<"success" | "failure"> {
    try {
        for (const messageId of messageIds) {
            await client.addReaction(messageId, reaction);
        }
        return "success";
    } catch (error) {
        console.error("Error reacting to messages", error);
        return "failure";
    }
}
