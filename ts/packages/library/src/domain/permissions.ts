export type PermissionRole = "none" | "moderators" | "owners" | "admins" | "members";

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

export type CommunityPermission =
    | "ChangeRoles"
    | "UpdateDetails"
    | "InviteUsers"
    | "RemoveMembers"
    | "CreatePublicChannel"
    | "CreatePrivateChannel"
    | "ManageUserGroups";

type LowercaseFirstLetter<T extends string> = T extends `${infer First}${infer Rest}`
    ? `${Lowercase<First>}${Rest}`
    : T;

export type LowercaseChatPermission = LowercaseFirstLetter<ChatPermission>;
export type LowercaseMessagePermission = LowercaseFirstLetter<MessagePermission>;
export type LowercaseCommunityPermission = LowercaseFirstLetter<CommunityPermission>;

export type GroupPermissions = Record<LowercaseChatPermission, PermissionRole> & {
    messagePermissions: MessagePermissions;
    threadPermissions?: MessagePermissions;
};

export type CustomPermission = { subtype: string; role: PermissionRole };

export type MessagePermissions = Partial<Record<LowercaseMessagePermission, PermissionRole>> & {
    custom: CustomPermission[];
    default: PermissionRole;
};
