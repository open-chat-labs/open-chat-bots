import { HttpAgent } from "@dfinity/agent";
import type {
    BotInstallationEvent,
    BotInstallationEventsResponse,
    BotInstallationEventsSuccess,
    UserSummaryResponse,
} from "../domain";
import {
    installationEventsResponse,
    principalStringToBytes,
    userSummaryResponse,
} from "../mapping";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import {
    UserIndexBotInstallationEventsArgs,
    UserIndexBotInstallationEventsResponse,
    UserIndexUserArgs,
    UserIndexUserResponse,
} from "../typebox/typebox";

export class UserIndexClient extends MsgpackCanisterAgent {
    constructor(
        agent: HttpAgent,
        protected userIndexCanisterId: string | undefined,
    ) {
        super(agent, userIndexCanisterId ?? "4bkt6-4aaaa-aaaaf-aaaiq-cai");
    }

    userSummary(userId: string): Promise<UserSummaryResponse> {
        return this.executeMsgpackQuery(
            "user",
            { user_id: principalStringToBytes(userId) },
            userSummaryResponse,
            UserIndexUserArgs,
            UserIndexUserResponse,
        ).catch((err) => {
            console.error("Call to user_index_client.user failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    async installationEvents(): Promise<BotInstallationEventsResponse> {
        const pageSize = 5000;
        let from = 0;
        let finished = false;
        const success = {
            kind: "success",
            botId: "",
            events: [] as BotInstallationEvent[],
        } as BotInstallationEventsSuccess;

        while (!finished) {
            const response = await this.installationEventsPage(from, pageSize);

            if (response.kind !== "success") {
                return response;
            }

            success.botId = response.botId;
            success.events = [...success.events, ...response.events];

            if (response.events.length < pageSize) {
                finished = true;
            } else {
                from += pageSize;
            }
        }

        return success;
    }

    private installationEventsPage(
        from: number,
        size: number,
    ): Promise<BotInstallationEventsResponse> {
        return this.executeMsgpackQuery(
            "bot_installation_events",
            { from, size },
            installationEventsResponse,
            UserIndexBotInstallationEventsArgs,
            UserIndexBotInstallationEventsResponse,
        ).catch((err) => {
            console.error(
                "Call to user_index_client.bot_installation_events failed with: ",
                JSON.stringify(err),
            );
            throw err;
        });
    }
}
