import { type InstallationLocation } from "./bot";
import type { ChatEvent, CommunityEvent } from "./event";
import type { ChatIdentifier, CommunityIdentifier } from "./identifiers";
import { Permissions } from "./permissions";

export type BotEventResult = BotEventParseFailure | BotEventWrapper;

export type BotEventParseFailure = {
    kind: "bot_event_parse_failure";
    error: unknown;
};

export type BotEventWrapper = {
    kind: "bot_event_wrapper";
    apiGateway: string;
    event: BotEvent;
    timestamp: bigint;
};

export type BotEvent = BotChatEvent | BotCommunityEvent | BotLifecycleEvent;

export type BotChatEvent = {
    kind: "bot_chat_event";
    event: ChatEvent;
    chatId: ChatIdentifier;
    thread?: number;
    eventIndex: number;
    latestEventIndex: number;
    initiatedBy?: string;
};

export type BotCommunityEvent = {
    kind: "bot_community_event";
    event: CommunityEvent;
    communityId: CommunityIdentifier;
    eventIndex: number;
    latestEventIndex: number;
    initiatedBy?: string;
};

export type BotRegisteredEvent = {
    kind: "bot_registered_event";
    botId: string;
    botName: string;
};

export type BotRemovedEvent = {
    kind: "bot_removed_event";
};

export type BotInstalledEvent = {
    kind: "bot_installed_event";
    installedBy: string;
    location: InstallationLocation;
    grantedCommandPermissions: Permissions;
    grantedAutonomousPermissions: Permissions;
};

export type BotUninstalledEvent = {
    kind: "bot_uninstalled_event";
    uninstalledBy: string;
    location: InstallationLocation;
};

export type BotLifecycleEvent =
    | BotRemovedEvent
    | BotRegisteredEvent
    | BotInstalledEvent
    | BotUninstalledEvent;
