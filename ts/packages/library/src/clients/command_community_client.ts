import type { HttpAgent } from "@dfinity/agent";
import type { BotClientConfig } from "../types";
import { BadRequestError } from "../utils/badrequest";
import { CommandBotClientBase } from "./command_client_base";

export class CommandBotCommunityClient extends CommandBotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string) {
        super(agent, env, encodedJwt);
        if (!this.isCommunityScope) {
            throw new BadRequestError("AccessTokenInvalid");
        }
    }
}
