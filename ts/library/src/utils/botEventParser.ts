/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    ChannelIdentifier,
    ChatIdentifier,
    CommunityIdentifier,
    DirectChatIdentifier,
    GroupChatIdentifier,
    Permissions,
    type InstallationLocation,
} from "../domain";
import type {
    BotChatEvent,
    BotCommunityEvent,
    BotEvent,
    BotEventResult,
    BotEventWrapper,
    BotInstalledEvent,
    BotLifecycleEvent,
    BotRegisteredEvent,
    BotUninstalledEvent,
} from "../domain/bot_events";
import { communityEvent, event, principalBytesToString } from "../mapping";
import { type BotPermissions } from "../typebox/typebox";
import { toBigInt32 } from "./bigint";

export function parseBotNotification(json: unknown): BotEventResult {
    try {
        if (typeof json === "string") {
            json = JSON.parse(json);
        }
        return parseBotEventWrapper(json);
    } catch (err) {
        return { kind: "bot_event_parse_failure", error: err };
    }
}

function parseBotEventWrapper(json: unknown): BotEventWrapper {
    const obj = json as any;

    if (obj == null || typeof obj !== "object" || !obj.g || !obj.e || !obj.t) {
        throw new Error("Invalid BotEventWrapper");
    }

    return {
        kind: "bot_event_wrapper",
        apiGateway: obj.g,
        event: parseBotEvent(obj.e),
        timestamp: BigInt(obj.t),
    };
}

function parseBotEvent(obj: any): BotEvent {
    if ("c" in obj) {
        return parseBotChatEvent(obj.c);
    }

    if ("u" in obj) {
        return parseBotCommunityEvent(obj.u);
    }

    if ("l" in obj) {
        return parseBotLifecycleEvent(obj.l);
    }

    throw new Error("Unknown BotEvent type");
}

function parseBotChatEvent(obj: any): BotChatEvent {
    if (
        obj == null ||
        typeof obj !== "object" ||
        obj.v == null ||
        obj.c == null ||
        obj.i == null ||
        obj.l == null
    ) {
        throw new Error("Invalid BotChatEvent");
    }

    return {
        kind: "bot_chat_event",
        event: event(obj.v),
        chatId: parseChatIdentifier(obj.c),
        thread: obj.t == null ? undefined : Number(obj.t),
        eventIndex: Number(obj.i),
        latestEventIndex: Number(obj.l),
        initiatedBy: obj.u == null ? undefined : obj.u,
    };
}

function parseBotCommunityEvent(obj: any): BotCommunityEvent {
    if (
        obj == null ||
        typeof obj !== "object" ||
        obj.e == null ||
        obj.c == null ||
        obj.i == null ||
        obj.l == null
    ) {
        throw new Error("Invalid BotChatEvent");
    }

    return {
        kind: "bot_community_event",
        event: communityEvent(obj.e),
        communityId: parseCommunityIdentifier(obj.c),
        eventIndex: Number(obj.i),
        latestEventIndex: Number(obj.l),
        initiatedBy: obj.u == null ? undefined : obj.u,
    };
}

function parseBotLifecycleEvent(obj: any): BotLifecycleEvent {
    if ("r" in obj) {
        return parseBotRegisteredEvent(obj.r);
    }

    if ("d" in obj) {
        return { kind: "bot_removed_event" };
    }

    if ("i" in obj) {
        return parseBotInstalledEvent(obj.i);
    }

    if ("u" in obj) {
        return parseBotUninstalledEvent(obj.u);
    }

    throw new Error("Unknown BotLifecycleEvent type");
}

function parseBotRegisteredEvent(obj: any): BotRegisteredEvent {
    if (obj == null || typeof obj !== "object" || obj.i == null || obj.n == null) {
        throw new Error("Invalid BotRegisteredEvent");
    }

    return {
        kind: "bot_registered_event",
        botId: principalBytesToString(obj.i),
        botName: obj.n,
    };
}

function parseBotUninstalledEvent(obj: any): BotUninstalledEvent {
    if (obj == null || typeof obj !== "object" || obj.u == null || obj.l == null) {
        throw new Error("Invalid BotUninistalledEvent");
    }

    return {
        kind: "bot_uninstalled_event",
        uninstalledBy: principalBytesToString(obj.u),
        location: parseInstallationLocation(obj.l),
    };
}

function parseBotInstalledEvent(obj: any): BotInstalledEvent {
    if (
        obj == null ||
        typeof obj !== "object" ||
        obj.u == null ||
        obj.l == null ||
        obj.p == null ||
        obj.a == null
    ) {
        throw new Error("Invalid BotInstalledEvent");
    }

    return {
        kind: "bot_installed_event",
        installedBy: principalBytesToString(obj.u),
        location: parseInstallationLocation(obj.l),
        grantedCommandPermissions: parseBotPermissions(obj.p),
        grantedAutonomousPermissions: parseBotPermissions(obj.a),
    };
}

function parseBotPermissions(perm: any): Permissions {
    return new Permissions(perm as BotPermissions);
}

function parseCommunityIdentifier(communityId: any): CommunityIdentifier {
    if (typeof communityId !== "string") {
        throw new Error("Unexpected communityId type");
    }
    return new CommunityIdentifier(principalBytesToString(communityId));
}

function parseChatIdentifier(obj: any): ChatIdentifier {
    if ("Direct" in obj) {
        return new DirectChatIdentifier(principalBytesToString(obj.Direct));
    }
    if ("Group" in obj) {
        return new GroupChatIdentifier(principalBytesToString(obj.Group));
    }
    if ("Channel" in obj) {
        const [communityId, channelId] = obj.Channel;
        return new ChannelIdentifier(principalBytesToString(communityId), toBigInt32(channelId));
    }
    throw new Error("Unexpected ChatIdentifier type received");
}

function parseInstallationLocation(obj: any): InstallationLocation {
    if ("User" in obj) {
        return new DirectChatIdentifier(principalBytesToString(obj.User));
    }
    if ("Group" in obj) {
        return new GroupChatIdentifier(principalBytesToString(obj.Group));
    }
    if ("Community" in obj) {
        return new CommunityIdentifier(principalBytesToString(obj.Community));
    }
    throw new Error("Unexpected InstallationLocation type received");
}
