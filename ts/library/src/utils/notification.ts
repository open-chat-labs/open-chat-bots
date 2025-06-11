import type { BotClient } from "../clients/bot_client";
import { BotClientFactory } from "../clients/client_factory";
import {
    ChatActionScope,
    CommunityActionScope,
    type ActionScope,
    type InstallationLocation,
    type Permissions,
} from "../domain";
import type { BotEvent, BotEventParseFailure, BotEventWrapper } from "../domain/bot_events";
import { parseBotNotification } from "./botEventParser";

export async function handleNotification<T>(
    json: unknown,
    factory: BotClientFactory,
    handler: (client: BotClient, ev: BotEvent, apiGateway: string) => Promise<T>,
    error?: (error: BotEventParseFailure) => T,
    autonomousPermissions?: Permissions,
): Promise<T | undefined> {
    const parsed = parseBotNotification(json);
    if (parsed.kind === "bot_event_wrapper") {
        const scope = scopeFromBotEventWrapper(parsed);
        if (scope !== undefined) {
            const client = factory.createClientInAutonomouseContext(
                scope,
                parsed.apiGateway,
                autonomousPermissions,
            );
            return handler(client, parsed.event, parsed.apiGateway);
        }
    } else {
        return error?.(parsed);
    }
}

function scopeFromBotEventWrapper(botEvent: BotEventWrapper): ActionScope | undefined {
    switch (botEvent.event.kind) {
        case "bot_chat_event":
            return new ChatActionScope(botEvent.event.chatId);
        case "bot_community_event":
            return new CommunityActionScope(botEvent.event.communityId);
        case "bot_installed_event":
            return installLocationToScope(botEvent.event.location);
        case "bot_uninstalled_event":
            return installLocationToScope(botEvent.event.location);
    }
}

function installLocationToScope(location: InstallationLocation): ActionScope {
    switch (location.kind) {
        case "community":
            return new CommunityActionScope(location);
        case "direct_chat":
            return new ChatActionScope(location);
        case "group_chat":
            return new ChatActionScope(location);
    }
}
