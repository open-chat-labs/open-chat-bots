import {
    apiAccessGateConfig,
    apiGroupPermissions,
    apiOptional,
    identity,
    apiAuthToken,
} from "../mapping";
import type { LocalUserIndexBotCreateChannelArgs } from "../typebox/typebox";
import { random128 } from "../utils/rng";
import type { AccessGateConfig } from "./access";
import type { AuthToken } from "./bot";
import type {
    GroupPermissions,
    PermissionRole,
    LowercaseMessagePermission as MessagePermission,
    LowercaseChatPermission as ChatPermission,
} from "./permissions";

export type Rules = { text: string; enabled: boolean };

export class Channel {
    #isPublic = true;
    #permissions: GroupPermissions = {
        changeRoles: "admin",
        removeMembers: "moderator",
        deleteMessages: "moderator",
        updateGroup: "admin",
        pinMessages: "admin",
        inviteUsers: "admin",
        addMembers: "admin",
        mentionAllMembers: "member",
        reactToMessages: "member",
        startVideoCall: "member",
        messagePermissions: {
            custom: [],
            default: "member",
            p2pSwap: "none",
        },
    };
    #messagesVisibleToNonMembers = false;
    #historyVisibleToNewJoiners = true;
    #rules: Rules = { text: "", enabled: false };
    #gateConfig?: AccessGateConfig = undefined;
    #externalUrl?: string = undefined;
    #avatar?: Uint8Array = undefined;
    #eventsTtl?: bigint = undefined;

    public setMessagesVisibleToNonMembers(val: boolean): Channel {
        this.#messagesVisibleToNonMembers = val;
        return this;
    }

    public setIsPublic(val: boolean): Channel {
        this.#isPublic = val;
        return this;
    }

    public get isPublic(): boolean {
        return this.#isPublic;
    }

    public setThreadPermissions(perm: MessagePermission, role: PermissionRole): Channel {
        if (this.#permissions.threadPermissions === undefined) {
            this.#permissions.threadPermissions = { custom: [], default: "member" };
        }
        this.#permissions.threadPermissions[perm] = role;
        return this;
    }

    public setMessagePermissions(perm: MessagePermission, role: PermissionRole): Channel {
        this.#permissions.messagePermissions[perm] = role;
        return this;
    }

    public setGroupPermission(perm: ChatPermission, role: PermissionRole): Channel {
        this.#permissions[perm] = role;
        return this;
    }

    public setHistoryVisibleToNewJoiners(val: boolean): Channel {
        this.#historyVisibleToNewJoiners = val;
        return this;
    }

    public setRules(text: string): Channel {
        this.#rules = { text, enabled: true };
        return this;
    }

    public set gateConfig(val: AccessGateConfig | undefined) {
        this.#gateConfig = val;
    }

    public setExternalUrl(val: string | undefined): Channel {
        this.#externalUrl = val;
        return this;
    }

    public setAvatar(val: Uint8Array | undefined): Channel {
        this.#avatar = val;
        return this;
    }

    public setEventsTtl(val: bigint | undefined): Channel {
        this.#eventsTtl = val;
        return this;
    }

    constructor(
        public name: string,
        public description: string,
    ) {}

    public toInputArgs(auth: AuthToken): LocalUserIndexBotCreateChannelArgs {
        return {
            is_public: this.#isPublic,
            permissions: apiOptional(this.#permissions, apiGroupPermissions),
            gate_config: apiOptional(this.#gateConfig, apiAccessGateConfig),
            auth_token: apiAuthToken(auth),
            external_url: apiOptional(this.#externalUrl, identity),
            name: this.name,
            description: this.description,
            events_ttl: apiOptional(this.#eventsTtl, identity),
            messages_visible_to_non_members: this.#messagesVisibleToNonMembers,
            history_visible_to_new_joiners: this.#historyVisibleToNewJoiners,
            rules: this.#rules,
            avatar: apiOptional(this.#avatar, (data) => {
                return {
                    id: random128(),
                    data,
                    mime_type: "image/jpg",
                };
            }),
        };
    }
}
