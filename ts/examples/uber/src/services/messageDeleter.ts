import { BotClient } from "@open-ic/openchat-botclient-ts";

export async function deleteMessage(
    client: BotClient,
    messageId: bigint,
): Promise<"success" | "failure"> {
    try {
        await client.deleteMessages([messageId]);
        return "success";
    } catch (error) {
        console.error("Error deleting message", error);
        return "failure";
    }
}
