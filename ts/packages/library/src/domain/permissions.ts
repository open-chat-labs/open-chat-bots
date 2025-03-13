import type { BotPermissions } from "../typebox/typebox";

export const chatPermissionList = [
    "ChangeRoles",
    "UpdateGroup",
    "AddMembers",
    "InviteUsers",
    "RemoveMembers",
    "DeleteMessages",
    "PinMessages",
    "ReactToMessages",
    "MentionAllMembers",
    "StartVideoCall",
    "ReadMessages",
    "ReadMembership",
    "ReadChatDetails",
] as const;
type ChatPermissionType = typeof chatPermissionList;
export type ChatPermission = ChatPermissionType[number];

export const communityPermissionList = [
    "ChangeRoles",
    "UpdateDetails",
    "InviteUsers",
    "RemoveMembers",
    "CreatePublicChannel",
    "CreatePrivateChannel",
    "ManageUserGroups",
] as const;

type CommunityPermissionType = typeof communityPermissionList;
export type CommunityPermission = CommunityPermissionType[number];

export const messagePermissionList = [
    "Text",
    "Image",
    "Video",
    "Audio",
    "File",
    "Poll",
    "Crypto",
    "Giphy",
    "Prize",
    "P2pSwap",
    "VideoCall",
] as const;

type MessagePermissionType = typeof messagePermissionList;
export type MessagePermission = MessagePermissionType[number];

export type PermissionRole = "none" | "moderator" | "owner" | "admin" | "member";

type LowercaseFirstLetter<T extends string> = T extends `${infer First}${infer Rest}`
    ? `${Lowercase<First>}${Rest}`
    : T;

export type LowercaseChatPermission = LowercaseFirstLetter<
    Exclude<ChatPermission, "ReadMessages" | "ReadMembership" | "ReadChatDetails">
>;
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

export class Permissions {
    constructor(private granted_permissions: BotPermissions) {}

    public static encodePermissions({
        community,
        chat,
        message,
    }: {
        community: CommunityPermission[];
        chat: ChatPermission[];
        message: MessagePermission[];
    }): BotPermissions {
        return {
            community: this.#permissionsToBits(community, [...communityPermissionList]),
            chat: this.#permissionsToBits(chat, [...chatPermissionList]),
            message: this.#permissionsToBits(message, [...messagePermissionList]),
        };
    }

    static #permissionsToBits<T>(permissions: T[], allPermissions: T[]): number {
        let bits = 0;
        for (let i = 0; i < allPermissions.length; i++) {
            if (permissions.includes(allPermissions[i])) {
                bits += 1 << i;
            }
        }
        return bits;
    }

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

    #hasPermission(granted: number, requested: number): boolean {
        const bitmask = 1 << requested;
        return (granted & bitmask) !== 0;
    }
}
