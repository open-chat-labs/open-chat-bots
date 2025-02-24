export abstract class Identifier {
    abstract readonly kind: "direct_chat" | "group_chat" | "channel" | "community";
    abstract canisterId(): string;
    isCommunity(): this is CommunityIdentifier {
        return this.kind === "community";
    }
    isDirectChat(): this is ChannelIdentifier {
        return this.kind === "direct_chat";
    }
    isMultiUserChat(): this is MultiUserChatIdentifier {
        return this.kind === "channel" || this.kind === "group_chat";
    }
    isChannel(): this is ChannelIdentifier {
        return this.kind === "channel";
    }
    isGroupChat(): this is GroupChatIdentifier {
        return this.kind === "group_chat";
    }
}

export class CommunityIdentifier extends Identifier {
    readonly kind = "community" as const;

    constructor(public readonly communityId: string) {
        super();
    }

    static fromJson(json: any): CommunityIdentifier {
        if ("kind" in json) {
            switch (json.kind) {
                case "community":
                    return new CommunityIdentifier(json.communityId);
                default:
                    throw new Error(`Invalid Identifier JSON: ${json}`);
            }
        } else {
            throw new Error(`Invalid Identifier JSON: ${json}`);
        }
    }

    canisterId(): string {
        return this.communityId;
    }
}

export abstract class ChatIdentifier extends Identifier {
    abstract readonly kind: "direct_chat" | "group_chat" | "channel";
    static fromJson(json: any): ChatIdentifier {
        if ("kind" in json) {
            switch (json.kind) {
                case "direct_chat":
                    return new DirectChatIdentifier(json.userId);
                case "channel":
                    return new ChannelIdentifier(json.communityId, json.channelId);
                case "group_chat":
                    return new GroupChatIdentifier(json.groupId);
                default:
                    throw new Error(`Invalid Identifier JSON: ${json}`);
            }
        } else {
            throw new Error(`Invalid Identifier JSON: ${json}`);
        }
    }
}

export abstract class MultiUserChatIdentifier extends ChatIdentifier {
    abstract readonly kind: "group_chat" | "channel";
}

export class ChannelIdentifier extends MultiUserChatIdentifier {
    readonly kind = "channel" as const;
    constructor(
        public readonly communityId: string,
        public readonly channelId: number,
    ) {
        super();
    }
    canisterId(): string {
        return this.communityId;
    }
}

export class DirectChatIdentifier extends ChatIdentifier {
    readonly kind = "direct_chat" as const;
    constructor(public readonly userId: string) {
        super();
    }
    canisterId(): string {
        return this.userId;
    }
}

export class GroupChatIdentifier extends ChatIdentifier {
    readonly kind = "group_chat" as const;
    constructor(public readonly groupId: string) {
        super();
    }
    canisterId(): string {
        return this.groupId;
    }
}
