import type { HttpAgent } from "@dfinity/agent";
import { BotClientBase } from "./client_base";
import type { BotClientConfig } from "../types";
import { BadRequestError } from "../utils/badrequest";

export class BotCommandCommunityClient extends BotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string) {
        super(agent, env, encodedJwt);
        if (!this.isCommunityScope) {
            throw new BadRequestError("AccessTokenInvalid");
        }
    }
}
