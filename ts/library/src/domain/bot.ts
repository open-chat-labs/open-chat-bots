import { type BotCommand, type BotPermissions, type Chat } from "../typebox/typebox";
import {
    CommunityIdentifier,
    DirectChatIdentifier,
    GroupChatIdentifier,
    type ChatIdentifier,
} from "./identifiers";
import type { ChatPermission, CommunityPermission, MessagePermission } from "./permissions";
import { Permissions } from "./permissions";
import type { ActionScope } from "./scope";

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
        public scope: ActionScope,
        granted_permissions: BotPermissions,
        public command?: BotCommand,
    ) {
        super(granted_permissions);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installationLocationFromJSON(json: any): InstallationLocation {
    if ("kind" in json) {
        if (json.kind === "community") {
            return CommunityIdentifier.fromJson(json);
        }
        if (json.kind === "group_chat") {
            return GroupChatIdentifier.fromJson(json) as GroupChatIdentifier;
        }
        if (json.kind === "direct_chat") {
            return DirectChatIdentifier.fromJson(json) as DirectChatIdentifier;
        }
    }
    throw Error(`Unable to convert json into InstallationLocation: ${json}`);
}

export type InstallationLocation = CommunityIdentifier | GroupChatIdentifier | DirectChatIdentifier;

export function chatIdentifierToInstallationLocation(chatId: ChatIdentifier): InstallationLocation {
    if (chatId.isChannel()) {
        return new CommunityIdentifier(chatId.communityId);
    } else {
        return chatId as DirectChatIdentifier | GroupChatIdentifier;
    }
}

type StringifiedInstallationRecord = {
    apiGateway: string;
    grantedCommandPermissions: BotPermissions;
    grantedAutonomousPermissions: BotPermissions;
    lastUpdated: string;
};

export class InstallationRecord {
    constructor(
        public apiGateway: string,
        public grantedCommandPermissions: Permissions,
        public grantedAutonomousPermissions: Permissions,
        public lastUpdated: bigint,
    ) {}

    toString() {
        return JSON.stringify({
            apiGateway: this.apiGateway,
            grantedCommandPermissions: this.grantedCommandPermissions.rawPermissions,
            grantedAutonomousPermissions: this.grantedAutonomousPermissions.rawPermissions,
            lastUpdated: this.lastUpdated.toString(),
        });
    }

    static fromString(str: string): InstallationRecord {
        const json = JSON.parse(str) as StringifiedInstallationRecord;
        return new InstallationRecord(
            json.apiGateway,
            new Permissions(json.grantedCommandPermissions),
            new Permissions(json.grantedAutonomousPermissions),
            BigInt(json.lastUpdated),
        );
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

export type DecodedPayload = DecodedJwt;

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
    userIndexCanisterId?: string;
};

export type CommandArg = CommandArgCommon & CommandArgType;

export type CommandArgCommon = {
    name: string;
};

export type CommandArgType =
    | UserArg
    | BooleanArg
    | StringArg
    | IntegerArg
    | DecimalArg
    | DateTimeArg;

export type UserArg = {
    kind: "user";
    userId?: string;
};

export type BooleanArg = {
    kind: "boolean";
    value?: boolean;
};

export type StringArg = {
    kind: "string";
    value?: string;
};

export type IntegerArg = {
    kind: "integer";
    value: bigint | null;
};

export type DecimalArg = {
    kind: "decimal";
    value: number | null; // this is to do with how number input binding works
};

export type DateTimeArg = {
    kind: "dateTime";
    value?: bigint | null;
};

// These are the things that are actually passed to the localuserindex endpoints to provide scope
export type BotChatContext = CommandChatContext | AutonomousChatContext;

export type AutonomousCommunityOrGroup = {
    kind: "autonomous";
    communityOrGroup: CommunityOrGroup;
};

export type CommunityOrGroup = CommunityIdentifier | GroupChatIdentifier;

export type CommandChatContext = { kind: "command"; jwt: string };

export type AutonomousChatContext = { kind: "autonomous"; chatId: ChatIdentifier };

export type BotCommunityOrGroupContext = CommandChatContext | AutonomousCommunityOrGroup;
