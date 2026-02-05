import { BotClient, CommunityIdentifier } from "@open-ic/openchat-botclient-ts";

export async function getTheRules(client: BotClient): Promise<string[]> {
    const promises: Promise<string>[] = [];
    const scope = client.scope;
    if (scope.isChatScope()) {
        if (scope.chat.isChannel()) {
            promises.push(
                client
                    .communitySummary(new CommunityIdentifier(scope.chat.communityId))
                    .then((resp) => {
                        if (resp.kind === "community_summary" && resp.rules.enabled) {
                            return resp.rules.text;
                        }
                        return "";
                    }),
            );
        }
        promises.push(
            client.chatSummary().then((resp) => {
                if (resp.kind === "group_chat" && resp.rules.enabled) {
                    return resp.rules.text;
                }
                return "";
            }),
        );
    }
    const result = await Promise.all(promises);
    return result.filter((r) => r !== "");
}
