import { ChatIdentifier, CommunityIdentifier } from "./identifiers";

export abstract class MergedActionScope {
    abstract readonly kind: "chat" | "community";
    abstract toString(): string;

    static fromString(scopeStr: string): MergedActionScope {
        const parsed = JSON.parse(scopeStr);
        if ("chat" in parsed) {
            return new MergedActionChatScope(
                ChatIdentifier.fromJson(parsed.chat),
                parsed.thread,
                parsed.messageId,
            );
        } else if ("communityId" in parsed) {
            return new MergedActionCommunityScope(CommunityIdentifier.fromJson(parsed.communityId));
        }
        throw new Error("Invalid MergedActionScope JSON");
    }

    isChatScope(): this is MergedActionChatScope {
        return this.kind === "chat";
    }

    isCommunityScope(): this is MergedActionCommunityScope {
        return this.kind === "community";
    }

    abstract isParentOf(scope: MergedActionScope): this is MergedActionCommunityScope;
}

export class MergedActionChatScope extends MergedActionScope {
    readonly kind = "chat" as const;

    constructor(
        public readonly chat: ChatIdentifier,
        public readonly thread?: number,
        public readonly messageId?: bigint,
    ) {
        super();
    }

    toString() {
        return JSON.stringify({
            kind: this.kind,
            chat: this.chat,
        });
    }

    isParentOf(_: MergedActionScope): this is MergedActionCommunityScope {
        return false;
    }
}

export class MergedActionCommunityScope extends MergedActionScope {
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

    isParentOf(scope: MergedActionScope): this is MergedActionCommunityScope {
        return (
            scope.isChatScope() &&
            scope.chat.isChannel() &&
            scope.chat.communityId === this.communityId.communityId
        );
    }
}
