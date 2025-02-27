import type {
    BotCommand,
    Chat,
    CommunityPermission,
    ChatPermission,
    MessagePermission,
} from "../typebox/typebox";
import type { MergedActionScope } from "./scope";

const communityPermissionMap = {
    ChangeRoles: 0,
    UpdateDetails: 1,
    InviteUsers: 2,
    RemoveMembers: 3,
    CreatePublicChannel: 4,
    CreatePrivateChannel: 5,
    ManageUserGroups: 6,
};
const chatPermissionsMap = {
    ChangeRoles: 0,
    UpdateGroup: 1,
    AddMembers: 2,
    InviteUsers: 3,
    RemoveMembers: 4,
    DeleteMessages: 5,
    PinMessages: 6,
    ReactToMessages: 7,
    MentionAllMembers: 8,
    StartVideoCall: 9,
    ReadMessages: 10,
    ReadMembership: 11,
    ReadChatDetails: 12,
};
const messagePermissionMap = {
    Text: 0,
    Image: 1,
    Video: 2,
    Audio: 3,
    File: 4,
    Poll: 5,
    Crypto: 6,
    Giphy: 7,
    Prize: 8,
    P2pSwap: 9,
    VideoCall: 10,
};

class DecodedAuth {
    constructor(protected granted_permissions: BitmaskPermissions) {}

    hasMessagePermission(perm: MessagePermission) {
        return this.granted_permissions.message
            ? this.#hasPermission(this.granted_permissions.message, messagePermissionMap[perm])
            : false;
    }

    hasChatPermission(perm: ChatPermission) {
        return this.granted_permissions.chat
            ? this.#hasPermission(this.granted_permissions.chat, chatPermissionsMap[perm])
            : false;
    }

    hasCommunityPermission(perm: CommunityPermission) {
        return this.granted_permissions.community
            ? this.#hasPermission(this.granted_permissions.community, communityPermissionMap[perm])
            : false;
    }

    #hasPermission(granted: number, n: number): boolean {
        const bitmask = 1 << n;
        return (granted & bitmask) !== 0;
    }
}

export class DecodedJwt extends DecodedAuth {
    kind = "jwt";
    constructor(
        public encoded: string,
        public bot_api_gateway: string,
        public bot: string,
        public scope: MergedActionScope,
        granted_permissions: BitmaskPermissions,
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
        granted_permissions: BitmaskPermissions,
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
    granted_permissions: BitmaskPermissions;
    command?: BotCommand;
};

export type RawApiKeyJwt = {
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: ApiKeyActionScope;
    granted_permissions: BitmaskPermissions;
};

export type RawApiKey = {
    gateway: string;
    bot_id: string;
    scope: ApiKeyActionScope;
    secret: string;
    permissions: BitmaskPermissions;
};

export type BitmaskPermissions = {
    community?: number;
    chat?: number;
    message?: number;
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
