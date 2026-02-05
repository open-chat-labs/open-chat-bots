import { BotClient, Channel } from "@open-ic/openchat-botclient-ts";

export async function createChannel(
    client: BotClient,
    name: string,
    description: string,
    isPublic: boolean,
): Promise<{ kind: "success"; channelId: bigint } | { kind: "failure" }> {
    try {
        const resp = await client.createChannel(
            new Channel(name, description).setIsPublic(isPublic),
        );
        if (resp.kind !== "error") {
            return resp;
        }
        console.error("Error creating channel", resp);
        return { kind: "failure"}
    } catch (error) {
        console.error("Error creating channel", error);
        return { kind: "failure"}
    }
}
