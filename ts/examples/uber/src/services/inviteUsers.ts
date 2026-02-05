import { BotClient } from "@open-ic/openchat-botclient-ts";

export async function inviteUsers(
    client: BotClient,
    userIds: string[],
    channelId?: bigint,
): Promise<"success" | "failure"> {
    try {
        const resp = await client.inviteUsers(userIds, channelId);
        if (resp.kind !== "error") {
            return "success";
        }
        console.error("Error inviting users", resp);
        return "failure";
    } catch (error) {
        console.error("Error inviting users", error);
        return "failure";
    }
}
