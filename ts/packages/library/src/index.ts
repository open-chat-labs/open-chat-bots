export { BotClientFactory } from "./clients/client_factory";
export * from "./services/bot_gateway";
export * from "./utils/badrequest";
export * from "./domain";
export { BotClient } from "./clients/bot_client";

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};

//@ts-ignore
Uint8Array.prototype.toJSON = function () {
    return Array.from(this);
};
