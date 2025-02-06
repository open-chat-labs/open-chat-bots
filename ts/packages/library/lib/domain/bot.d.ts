import type { Chat } from "../services/storageIndex/candid/types";
import type { ChatPermission, CommunityPermission, MessagePermission } from "./permissions";
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
export type BotPermissions = {
    community: CommunityPermission[];
    chat: ChatPermission[];
    message: MessagePermission[];
};
export type BotCommand = {
    name: string;
    args: BotCommandArg[];
    initiator: string;
};
export type BotActionScope = BotActionChatScope | BotActionCommunityScope;
export type BotActionChatScope = {
    Chat: {
        chat: Chat;
        thread_root_message_index?: number;
        message_id?: bigint;
    };
};
export type BotActionCommunityScope = {
    Community: {
        community_id: string;
    };
};
export type BotCommandArg = {
    name: string;
    value: BotCommandArgValue;
};
export type BotCommandArgValue = BotCommandStringValue | BotCommandBooleanValue | BotCommandNumberValue | BotCommandUserValue;
export type BotCommandStringValue = {
    String: string;
};
export type BotCommandBooleanValue = {
    Boolean: boolean;
};
export type BotCommandNumberValue = {
    Number: number;
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
export type JwtAuthToken = {
    kind: "jwt";
    token: string;
};
export type ApiKey = {
    kind: "api_key";
    token: string;
};
export type BlobReference = {
    blobId: bigint;
    canisterId: string;
};
export type DataContent = {
    blobReference?: BlobReference;
    blobData?: Uint8Array;
    blobUrl?: string;
};
