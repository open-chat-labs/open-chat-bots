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
        console.error("Error reacting to messag", error);
        return "failure";
    }
}
