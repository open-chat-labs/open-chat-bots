import type { HttpAgent } from "@dfinity/agent";
import type { BotClientConfig } from "../types";
import { CommandBotClientBase } from "./command_client_base";
export declare class CommandBotCommunityClient extends CommandBotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string);
}
