export { BotClientFactory } from "./clients/client_factory";
export * from "./utils/badrequest";
export * from "./types";
export { BotClient } from "./clients/bot_client";

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};
