import type { BotCommand, BotPermissions, Chat } from "../typebox/typebox";
import type { ChatPermission, CommunityPermission, MessagePermission } from "./permissions";
import { Permissions } from "./permissions";
import type { MergedActionScope } from "./scope";

class DecodedAuth {
    #perm: Permissions;
    constructor(protected granted_permissions: BotPermissions) {
        this.#perm = new Permissions(granted_permissions);
    }

    hasMessagePermission(perm: MessagePermission) {
        return this.#perm.hasMessagePermission(perm);
    }

    hasChatPermission(perm: ChatPermission) {
        return this.#perm.hasChatPermission(perm);
    }

    hasCommunityPermission(perm: CommunityPermission) {
        return this.#perm.hasCommunityPermission(perm);
    }
}

export class DecodedJwt extends DecodedAuth {
    kind = "jwt";
    constructor(
        public encoded: string,
        public bot_api_gateway: string,
        public bot: string,
        public scope: MergedActionScope,
        granted_permissions: BotPermissions,
        public command?: BotCommand,
    ) {
        super(granted_permissions);
    }
}

export class DecodedApiKey extends DecodedAuth {
    kind = "api_key";
    constructor(
        public encoded: string,
        public bot_api_gateway: string,
        public bot: string,
        public scope: MergedActionScope,
        granted_permissions: BotPermissions,
    ) {
        super(granted_permissions);
    }
}

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
    permissions: BotPermissions;
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
    Community: string;
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
