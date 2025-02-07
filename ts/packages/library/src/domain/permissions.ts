import type { CommunityPermission, GroupPermission, MessagePermission } from "../typebox/typebox";

export type PermissionRole = "none" | "moderators" | "owners" | "admins" | "members";

type LowercaseFirstLetter<T extends string> = T extends `${infer First}${infer Rest}`
    ? `${Lowercase<First>}${Rest}`
    : T;

export type LowercaseChatPermission = LowercaseFirstLetter<GroupPermission>;
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
