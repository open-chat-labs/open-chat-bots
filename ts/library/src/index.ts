/* eslint-disable @typescript-eslint/ban-ts-comment */
export { BotClient } from "./clients/bot_client";
export { BotClientFactory } from "./clients/client_factory";
export * from "./domain";
export * from "./services/bot_gateway";
export {
    BotDefinition,
    type MemberType,
    type OgPreview,
    type OgPreviewImage,
} from "./typebox/typebox";
export * from "./utils/badrequest";
export {
    DEFAULT_PREVIEW_PROXY_URL,
    MAX_LINK_PREVIEWS,
    clearOgPreviewCache,
    extractEnabledLinks,
    fetchOgPreviews,
    fetchOgPreviewsForText,
} from "./utils/linkPreviews";
export { handleNotification } from "./utils/notification";

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};

//@ts-ignore
Uint8Array.prototype.toJSON = function () {
    return Array.from(this);
};
