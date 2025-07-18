import { mapCommandScope } from "../mapping";
import type { BotCommand } from "../typebox/typebox";
import type {
    BotChatContext,
    BotCommunityOrGroupContext,
    CommandActionScope,
    RawCommandJwt,
} from "./bot";
import { ChannelIdentifier, CommunityIdentifier } from "./identifiers";
import type { ChatPermission, CommunityPermission, MessagePermission } from "./permissions";
import { Permissions } from "./permissions";
import type { ActionScope } from "./scope";

function messageIdFromCommandScope(scope: CommandActionScope): bigint | undefined {
    if ("Chat" in scope) {
        return scope.Chat.message_id;
    }
    return undefined;
}

function threadFromCommandScope(scope: CommandActionScope): number | undefined {
    if ("Chat" in scope) {
        return scope.Chat.thread;
    }
    return undefined;
}

export class ActionContext {
    constructor(
        public apiGateway: string,
        public scope: ActionScope,
        public permissions?: Permissions,
        public command?: BotCommand,
        public messageId?: bigint,
        public thread?: number,
        public jwt?: string,
    ) {}

    static inAutonomousContext(
        scope: ActionScope,
        apiGateway: string,
        autonomousPermissions?: Permissions,
    ): ActionContext {
        return new ActionContext(apiGateway, scope, autonomousPermissions);
    }

    static fromCommand(token: string, jwt: RawCommandJwt): ActionContext {
        return new ActionContext(
            jwt.bot_api_gateway,
            mapCommandScope(jwt.scope),
            new Permissions(jwt.granted_permissions),
            jwt.command,
            messageIdFromCommandScope(jwt.scope),
            threadFromCommandScope(jwt.scope),
            token,
        );
    }

    hasMessagePermission(perm: MessagePermission): boolean {
        return this.permissions?.hasMessagePermission(perm) ?? true;
    }

    hasChatPermission(perm: ChatPermission): boolean {
        return this.permissions?.hasChatPermission(perm) ?? true;
    }

    hasCommunityPermission(perm: CommunityPermission): boolean {
        return this.permissions?.hasCommunityPermission(perm) ?? true;
    }

    chatContext(channelId?: bigint): BotChatContext {
        if (this.jwt !== undefined) {
            return { kind: "command", jwt: this.jwt };
        }

        if (this.scope.isChatScope()) {
            return { kind: "autonomous", chatId: this.scope.chat };
        }

        if (this.scope.isCommunityScope() && channelId !== undefined) {
            return {
                kind: "autonomous",
                chatId: new ChannelIdentifier(this.scope.communityId.communityId, channelId),
            };
        }

        throw new Error(
            `Unable to derive BotChatContext from ActionContext: ${this}, ${channelId}`,
        );
    }

    communityOrGroupChatContext(): BotCommunityOrGroupContext {
        if (this.jwt !== undefined) {
            return { kind: "command", jwt: this.jwt };
        }

        if (this.scope.isChatScope()) {
            if (this.scope.chat.isGroupChat()) {
                return { kind: "autonomous", communityOrGroup: this.scope.chat };
            }
            if (this.scope.chat.isChannel()) {
                return {
                    kind: "autonomous",
                    communityOrGroup: new CommunityIdentifier(this.scope.chat.communityId),
                };
            }
        }

        if (this.scope.isCommunityScope()) {
            return {
                kind: "autonomous",
                communityOrGroup: this.scope.communityId,
            };
        }

        throw new Error(`Unable to derive BotChatContext from ActionContext: ${this}`);
    }
}
