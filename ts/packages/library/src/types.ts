import type { MessageContent } from "./services/bot_gateway/candid/types";
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
    exp: number;
    claim_type: string;
    bot_api_gateway: string;
    bot: string;
    scope: BotActionScope;
    granted_permissions: BotPermissions;
    command: BotCommand;
};

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
        message_id: bigint;
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
};

export type BotAction = SendMessageAction;

export type SendMessageAction = {
    SendMessage: Message;
};
