import { BotClient, PermissionRole } from "@open-ic/openchat-botclient-ts";

export async function changeRole(
    client: BotClient,
    userId: string,
    role: PermissionRole,
): Promise<"success" | "failure"> {
    try {
        const resp = await client.changeRole([userId], role);
        if (resp.kind !== "error") {
            return "success";
        }
        console.error("Error changing user role", resp);
        return "failure";
    } catch (error) {
        console.error("Error changing user role", error);
        return "failure";
    }
}
