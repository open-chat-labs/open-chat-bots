import { BotClientFactory } from "@open-ic/openchat-botclient-ts";

export const factory = new BotClientFactory({
    openchatPublicKey: process.env.OC_PUBLIC!,
    icHost: process.env.IC_HOST!,
    identityPrivateKey: process.env.IDENTITY_PRIVATE!,
    openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
    userIndexCanisterId: process.env.USER_INDEX_CANISTER!,
});
