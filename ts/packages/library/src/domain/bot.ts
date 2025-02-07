import type { BotActionScope, BotCommand, BotPermissions, Chat } from "../typebox/typebox";

export type DecodedJwt = {
    kind: "jwt";
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: BotActionScope;
    granted_permissions: BotPermissions;
    command: BotCommand;
};

export type DecodedApiKey = {
    kind: "api_key";
    gateway: string;
    bot_id: string;
    scope: BotActionScope;
    secret: string;
};

export type DecodedPayload = DecodedApiKey | DecodedJwt;

export type BotActionChatScope = {
    Chat: {
        chat: Chat;
        thread?: number;
        message_id: bigint;
    };
};

export type BotActionCommunityScope = {
    Community: {
        community_id: Uint8Array;
    };
};

export type BotCommandUserValue = {
    User: Uint8Array;
};

export type BotClientConfig = {
    openStorageCanisterId: string;
    icHost: string;
    identityPrivateKey: string;
    openchatPublicKey: string;
};

export type AuthToken = JwtAuthToken | ApiKey;

export type JwtAuthToken = { kind: "jwt"; token: string };

export type ApiKey = { kind: "api_key"; token: string };

export type BlobReference = {
    blobId: bigint;
    canisterId: string;
};

export type DataContent = {
    blobReference?: BlobReference;
    blobData?: Uint8Array;
    blobUrl?: string;
};
