import { HttpAgent } from "@dfinity/agent";
import type { BotActionScope, BotClientConfig, BotCommandArg, DecodedJwt, Message } from "../types";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { BotClientBase } from "./client_base";
export declare class CommandBotClientBase extends BotClientBase {
    #private;
    protected encodedJwt: string;
    protected decodedJwt: DecodedJwt;
    constructor(agent: HttpAgent, env: BotClientConfig, encodedJwt: string);
    stringArg(name: string): string | undefined;
    booleanArg(name: string): boolean | undefined;
    numberArg(name: string): number | undefined;
    userArg(name: string): string | undefined;
    get commandArgs(): BotCommandArg[];
    get commandName(): string;
    get initiator(): string;
    get scope(): BotActionScope;
    isChatScope(): boolean;
    isCommunityScope(): boolean;
    get botId(): string;
    sendMessage(message: Message): Promise<BotSendMessageResponse>;
}
