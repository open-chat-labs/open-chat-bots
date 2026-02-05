import { BotClient, GroupChatSummary } from "@open-ic/openchat-botclient-ts";
import { DirectChatSummary } from "@open-ic/openchat-botclient-ts/lib/typebox/typebox";

export async function chatSummary(
    client: BotClient,
): Promise<DirectChatSummary | GroupChatSummary | "failure"> {
    try {
        const resp = await client.chatSummary();
        if (resp.kind !== "error") {
            return resp as DirectChatSummary | GroupChatSummary;
        }
        console.error("Error getting chat summary", resp);
        return "failure";
    } catch (error) {
        console.error("Error getting chat summary", error);
        return "failure";
    }
}
