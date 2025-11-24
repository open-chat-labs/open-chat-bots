import { HttpAgent } from "@dfinity/agent";
import type { BotClientConfig, UserSummaryResponse } from "../../domain";
import { principalStringToBytes, userSummaryResponse } from "../../mapping";
import { UserIndexUserArgs, UserIndexUserResponse } from "../../typebox/typebox";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";

export class UserIndexClient extends MsgpackCanisterAgent {
    constructor(
        agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super(agent, env.userIndexCanisterId ?? "4bkt6-4aaaa-aaaaf-aaaiq-cai");
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
}
