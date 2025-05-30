import { mapCommandScope } from "../mapping";
import type { BotCommand, BotPermissions } from "../typebox/typebox";
import type { BotChatContext, CommandActionScope, RawCommandJwt } from "./bot";
import { ChannelIdentifier } from "./identifiers";
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
    #perm: Permissions;

    constructor(
        public apiGateway: string,
        public scope: ActionScope,
        public permissions: BotPermissions,
        public command?: BotCommand,
        public messageId?: bigint,
        public thread?: number,
        public jwt?: string,
    ) {
        this.#perm = new Permissions(permissions);
    }

    static fromCommand(token: string, jwt: RawCommandJwt): ActionContext {
        return new ActionContext(
            jwt.bot_api_gateway,
            mapCommandScope(jwt.scope),
            jwt.granted_permissions,
            jwt.command,
            messageIdFromCommandScope(jwt.scope),
            threadFromCommandScope(jwt.scope),
            token,
        );
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
}
