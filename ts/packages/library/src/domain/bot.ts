import type { BotCommand, BotPermissions, Chat } from "../typebox/typebox";
import type { ChatIdentifier, CommunityIdentifier } from "./identifiers";

export type DecodedJwt = {
    kind: "jwt";
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: MergedActionScope;
    granted_permissions: BotPermissions;
    command?: BotCommand;
};

export type DecodedApiKey = {
    kind: "api_key";
    gateway: string;
    bot_id: string;
    scope: MergedActionScope;
    secret: string;
};

export type RawCommandJwt = {
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: CommandActionScope;
    granted_permissions: BotPermissions;
    command?: BotCommand;
};

export type RawApiKeyJwt = {
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: ApiKeyActionScope;
    granted_permissions: BotPermissions;
};

export type RawApiKey = {
    gateway: string;
    bot_id: string;
    scope: ApiKeyActionScope;
    secret: string;
};

export type MergedActionScope = MergedActionChatScope | MergedActionCommunityScope;

export type MergedActionChatScope = {
    kind: "chat";
    chat: ChatIdentifier;
    thread?: number;
    messageId?: bigint;
};

export type MergedActionCommunityScope = {
    kind: "community";
    communityId: CommunityIdentifier;
};

export type DecodedPayload = DecodedApiKey | DecodedJwt;

export type ApiKeyActionScope = ApiKeyActionChatScope | ApiKeyActionCommunityScope;

export type ApiKeyActionChatScope = {
    Chat: Chat;
};

export type ApiKeyActionCommunityScope = CommandActionCommunityScope;

export type CommandActionChatScope = {
    Chat: {
        chat: Chat;
        thread?: number;
        message_id?: bigint;
    };
};

export type CommandActionScope = CommandActionChatScope | CommandActionCommunityScope;

export type CommandActionCommunityScope = {
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

export type AuthToken = CommandJwtAuthToken | ApiKeyJwtAuthToken | ApiKey;

export type CommandJwtAuthToken = { kind: "command_jwt"; token: string };

export type ApiKeyJwtAuthToken = { kind: "api_jwt"; token: string };

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
