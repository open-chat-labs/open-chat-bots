import { BotClient, ChannelIdentifier } from "@open-ic/openchat-botclient-ts";

export async function deleteChannel(
    client: BotClient,
    channelId: ChannelIdentifier,
): Promise<"success" | "failure"> {
    try {
        const resp = await client.deleteChannel(channelId);
        if (resp.kind !== "error") {
            return "success";
        }
        console.error("Error deleting channel", resp);
        return "failure";
    } catch (error) {
        console.error("Error creating channel", error);
        return "failure";
    }
}
