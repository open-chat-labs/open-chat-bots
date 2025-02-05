import type {
    AccessGateConfig,
    GroupPermissions,
    MessageContent,
    Rules,
} from "./services/bot_gateway/candid/types";
import type { Chat } from "./services/storageIndex/candid/types";

/**
 * {
  "exp": 1738161898,
  "claim_type": "BotActionByCommand",
  "bot_api_gateway": "br5f7-7uaaa-aaaaa-qaaca-cai",
  "bot": "gclbp-c2pfl-fd5yz-gbx7q",
  "scope": {
    "Chat": {
      "chat": {
        "Channel": [
          "dzh22-nuaaa-aaaaa-qaaoa-cai",
          4250501687
        ]
      },
      "message_id": "13725073101415317707"
    }
  },
  "granted_permissions": {
    "community": [],
    "chat": [],
    "message": [
      "Image",
      "File",
      "Text"
    ]
  },
  "command": {
    "name": "news",
    "args": [],
    "initiator": "dccg7-xmaaa-aaaaa-qaamq-cai"
  }
}
 */
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

export type CommunityPermission =
    | "ChangeRoles"
    | "UpdateDetails"
    | "InviteUsers"
    | "RemoveMembers"
    | "CreatePublicChannel"
    | "CreatePrivateChannel"
    | "ManageUserGroups";

export type ChatPermission =
    | "ChangeRoles"
    | "UpdateGroup"
    | "AddMembers"
    | "InviteUsers"
    | "RemoveMembers"
    | "DeleteMessages"
    | "PinMessages"
    | "ReactToMessages"
    | "MentionAllMembers"
    | "StartVideoCall";

export type MessagePermission =
    | "Text"
    | "Image"
    | "Video"
    | "Audio"
    | "File"
    | "Poll"
    | "Crypto"
    | "Giphy"
    | "Prize"
    | "P2pSwap"
    | "VideoCall";

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

export type BotCommandArgValue =
    | BotCommandStringValue
    | BotCommandBooleanValue
    | BotCommandNumberValue
    | BotCommandUserValue;

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

export type Message = {
    id: bigint;
    content: MessageContent;
    finalised: boolean;
    blockLevelMarkdown?: boolean;
};

export type AuthToken = JwtAuthToken | ApiKey;

export type JwtAuthToken = { kind: "jwt"; token: string };

export type ApiKey = { kind: "api_key"; token: string };

export type ChannelOptions = {
    isPublic: boolean;
    permissions?: GroupPermissions;
    gateConfig?: AccessGateConfig;
    externalUrl?: string;
    eventsTtl?: bigint;
    messagesVisibleToNonMembers: boolean;
    historyVisibleToNewJoiners: boolean;
    rules: Rules;
    avatar?: Uint8Array;
};

export const defaultChannelOptions: ChannelOptions = {
    isPublic: true,
    permissions: {
        change_roles: { Admins: null },
        remove_members: { Moderators: null },
        delete_messages: { Moderators: null },
        update_group: { Admins: null },
        pin_messages: { Admins: null },
        invite_users: { Admins: null },
        add_members: { Admins: null },
        mention_all_members: { Members: null },
        react_to_messages: { Members: null },
        start_video_call: { Members: null },
        thread_permissions: [],
        message_permissions: {
            audio: [],
            video: [],
            video_call: [],
            custom: [],
            file: [],
            poll: [],
            text: [],
            crypto: [],
            giphy: [],
            default: { Members: null },
            image: [],
            prize: [],
            p2p_swap: [{ None: null }],
        },
    },
    messagesVisibleToNonMembers: false,
    historyVisibleToNewJoiners: true,
    rules: { text: "", enabled: false },
};
