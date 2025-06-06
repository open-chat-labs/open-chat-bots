import type { BotClient } from "../clients/bot_client";
import { BotClientFactory } from "../clients/client_factory";
import {
    ChatActionScope,
    CommunityActionScope,
    type ActionScope,
    type InstallationLocation,
} from "../domain";
import type { BotEvent, BotEventWrapper } from "../domain/bot_events";
import { parseBotNotification } from "./botEventParser";

export function handleNotification(
    json: unknown,
    factory: BotClientFactory,
    handler: (client: BotClient, ev: BotEvent) => Promise<void>,
    error?: (err: unknown) => void,
): Promise<void> {
    const result = parseBotNotification(json);
    if (result.kind === "bot_event_wrapper") {
        const scope = scopeFromBotEventWrapper(result);
        if (scope !== undefined) {
            const client = factory.createClientInAutonomouseContext(scope, result.apiGateway);
            return handler(client, result.event);
        }
    } else {
        error?.(result);
    }
    return Promise.resolve();
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
