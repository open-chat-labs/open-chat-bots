import type { AuthToken, BotActionChatScope, BotActionCommunityScope, BotActionScope, BotClientConfig, BotCommand, BotCommandArg } from "../types";
export declare class Payload {
    #private;
    auth: AuthToken;
    constructor(auth: AuthToken, env: BotClientConfig);
    get scope(): BotActionScope;
    isChatScope(scope: BotActionScope): scope is BotActionChatScope;
    isCommunityScope(scope: BotActionScope): scope is BotActionCommunityScope;
    get botApiGateway(): string;
    get botId(): string;
    get command(): BotCommand | undefined;
    stringArg(name: string): string | undefined;
    booleanArg(name: string): boolean | undefined;
    numberArg(name: string): number | undefined;
    userArg(name: string): string | undefined;
    get commandArgs(): BotCommandArg[];
    get commandName(): string | undefined;
    get initiator(): string | undefined;
}
export declare function isChatScope(scope: BotActionScope): scope is BotActionChatScope;
export declare function isCommunityScope(scope: BotActionScope): scope is BotActionCommunityScope;
