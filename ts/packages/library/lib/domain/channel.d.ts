import type { BotCreateChannelArgs } from "../services/bot_gateway/candid/types";
import type { AccessGateConfig } from "./access";
import type { AuthToken } from "./bot";
import type { PermissionRole, LowercaseMessagePermission as MessagePermission, LowercaseChatPermission as ChatPermission } from "./permissions";
export type Rules = {
    text: string;
    enabled: boolean;
};
export declare class Channel {
    #private;
    name: string;
    description: string;
    setMessagesVisibleToNonMembers(val: boolean): Channel;
    setIsPublic(val: boolean): Channel;
    setThreadPermissions(perm: MessagePermission, role: PermissionRole): Channel;
    setMessagePermissions(perm: MessagePermission, role: PermissionRole): Channel;
    setGroupPermission(perm: ChatPermission, role: PermissionRole): Channel;
    setHistoryVisibleToNewJoiners(val: boolean): Channel;
    setRules(text: string): Channel;
    set gateConfig(val: AccessGateConfig | undefined);
    setExternalUrl(val: string | undefined): Channel;
    setAvatar(val: Uint8Array | undefined): Channel;
    setEventsTtl(val: bigint | undefined): Channel;
    constructor(name: string, description: string);
    toInputArgs(auth: AuthToken): BotCreateChannelArgs;
}
