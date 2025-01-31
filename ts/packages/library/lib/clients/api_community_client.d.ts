import type { HttpAgent } from "@dfinity/agent";
import { BotClientBase } from "./client_base";
import type { BotClientConfig } from "../types";
export declare class BotApiKeyCommunityClient extends BotClientBase {
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string);
}
