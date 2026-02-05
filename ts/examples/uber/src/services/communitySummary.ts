import { BotClient, CommunityIdentifier, CommunitySummary } from "@open-ic/openchat-botclient-ts";

export async function communitySummary(client: BotClient): Promise<CommunitySummary | "failure"> {
    try {
        const scope = client.scope;
        if (scope.isChatScope()) {
            if (scope.chat.isChannel()) {
                const resp = await client.communitySummary(
                    new CommunityIdentifier(scope.chat.communityId),
                );
                if (resp.kind === "community_summary") {
                    return resp;
                }
                console.error("Error getting community summary", resp);
                return "failure";
            }
        }
        return "failure";
    } catch (error) {
        console.error("Error getting community summary", error);
        return "failure";
    }
}
