import { BotClient, PermissionRole } from "@open-ic/openchat-botclient-ts";

export async function findUserIdForUsername(
    client: BotClient,
    username: string,
): Promise<string | "failure"> {
    try {
        const resp = await client.members([]);
        if (resp.kind !== "error") {
            resp.members
            return "success";
        }
        console.error("Error changing user role", resp);
        return "failure";
    } catch (error) {
        console.error("Error changing user role", error);
        return "failure";
    }
}
