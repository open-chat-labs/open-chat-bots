import { type InstallationLocation } from "./bot";
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
};

export type BotEvent = BotChatEvent | BotCommunityEvent | BotLifecycleEvent;

export type ChatEventType =
    | "message"
    | "message_edited"
    | "message_reaction"
    | "message_tipped"
    | "message_deleted"
    | "message_undeleted"
    | "message_poll_vote"
    | "message_poll_ended"
    | "message_prize_claim"
    | "message_p2p_swap_completed"
    | "message_p2p_swap_cancelled"
    | "message_video_call"
    | "message_other"
    | "created"
    | "name_changed"
    | "description_changed"
    | "rules_changed"
    | "avatar_changed"
    | "external_url_updated"
    | "permissions_changed"
    | "gate_updated"
    | "visibility_changed"
    | "invite_code_changed"
    | "frozen"
    | "unfrozen"
    | "disappearing_messages_updated"
    | "message_pinned"
    | "message_unpinned"
    | "members_joined"
    | "members_left"
    | "role_changed"
    | "users_invited"
    | "users_blocked"
    | "users_unblocked"
    | "bot_added"
    | "bot_removed"
    | "bot_updated";

export type CommunityEventType =
    | "created"
    | "name_changed"
    | "description_changed"
    | "rules_changed"
    | "avatar_changed"
    | "banner_changed"
    | "permissions_changed"
    | "visibility_changed"
    | "invite_code_changed"
    | "frozen"
    | "unfrozen"
    | "events_ttl_updated"
    | "gate_updated"
    | "message_pinned"
    | "message_unpinned"
    | "primary_language_changed"
    | "group_imported"
    | "channel_created"
    | "channel_deleted"
    | "members_joined"
    | "members_left"
    | "role_changed"
    | "users_invited"
    | "bot_added"
    | "bot_removed"
    | "bot_updated"
    | "users_blocked"
    | "users_unblocked";

export type BotChatEvent = {
    kind: "bot_chat_event";
    eventType: ChatEventType;
    chatId: ChatIdentifier;
    thread?: number;
    eventIndex: number;
    latestEventIndex: number;
    initiatedBy?: string;
};

export type BotCommunityEvent = {
    kind: "bot_community_event";
    eventType: CommunityEventType;
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
