import { ChatIdentifier, CommunityIdentifier } from "./identifiers";

export abstract class ActionScope {
    abstract readonly kind: "chat" | "community";
    abstract toString(): string;

    static fromString(scopeStr: string): ActionScope {
        const parsed = JSON.parse(scopeStr);
        if ("chat" in parsed) {
            return new ChatActionScope(ChatIdentifier.fromJson(parsed.chat));
        } else if ("communityId" in parsed) {
            return new CommunityActionScope(CommunityIdentifier.fromJson(parsed.communityId));
        }
        throw new Error("Invalid MergedActionScope JSON");
    }

    isChatScope(): this is ChatActionScope {
        return this.kind === "chat";
    }

    isCommunityScope(): this is CommunityActionScope {
        return this.kind === "community";
    }

    abstract isParentOf(scope: ActionScope): this is CommunityActionScope;
}

export class ChatActionScope extends ActionScope {
    readonly kind = "chat" as const;

    constructor(public readonly chat: ChatIdentifier) {
        super();
    }

    toString() {
        return JSON.stringify({
            kind: this.kind,
            chat: this.chat,
        });
    }

    isParentOf(_: ActionScope): this is CommunityActionScope {
        return false;
    }
}

export class CommunityActionScope extends ActionScope {
    readonly kind = "community" as const;

    constructor(public readonly communityId: CommunityIdentifier) {
        super();
    }

    toString() {
        return JSON.stringify({
            kind: this.kind,
            communityId: this.communityId,
        });
    }

    isParentOf(scope: ActionScope): this is CommunityActionScope {
        return (
            scope.isChatScope() &&
            scope.chat.isChannel() &&
            scope.chat.communityId === this.communityId.communityId
        );
    }
}
