/* eslint-disable @typescript-eslint/ban-ts-comment */
export { BotClient } from "./clients/bot_client";
export { BotClientFactory } from "./clients/client_factory";
export * from "./domain";
export * from "./services/bot_gateway";
export { BotDefinition } from "./typebox/typebox";
export * from "./utils/badrequest";
export { parseBotNotification } from "./utils/botEventParser";

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};

//@ts-ignore
Uint8Array.prototype.toJSON = function () {
    return Array.from(this);
};
