import crypto from "crypto";
import { joseToDer } from "ecdsa-sig-formatter";
import type { BotClient } from "../clients/bot_client";
import { BotClientFactory } from "../clients/client_factory";
import {
    ChatActionScope,
    CommunityActionScope,
    type ActionScope,
    type InstallationLocation,
    type Permissions,
} from "../domain";
import type {
    BotEvent,
    BotEventParseFailure,
    BotEventResult,
    BotEventWrapper,
} from "../domain/bot_events";
import { botEventWrapper } from "../mapping";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import { BotEventWrapper as ApiBotEventWrapper } from "../typebox/typebox";

export function verify(publicKey: string, message: Buffer, base64Sig: string) {
    const derSig = joseToDer(base64Sig, "ES256");
    const verifier = crypto.createVerify("SHA256");
    verifier.update(message);
    verifier.end();
    return verifier.verify(publicKey.replace(/\\n/g, "\n"), derSig);
}

function verifyAndDecodeNotification(
    publicKey: string,
    signature: string,
    bytes: Buffer,
): BotEventResult {
    try {
        const valid = verify(publicKey, bytes, signature);
        if (valid) {
            return MsgpackCanisterAgent.processMsgpackResponse(
                MsgpackCanisterAgent.bufferToArrayBuffer(bytes),
                botEventWrapper,
                ApiBotEventWrapper,
            );
        }
        return { kind: "bot_event_parse_failure", error: "Unable to verify bot event signature" };
    } catch (err) {
        console.error("Unable to verify and decode bot event", err);
        return { kind: "bot_event_parse_failure", error: err };
    }
}

export async function handleNotification<T>(
    signature: string,
    rawNotification: Buffer,
    factory: BotClientFactory,
    handler: (client: BotClient, ev: BotEvent, apiGateway: string) => Promise<T>,
    error: (error: BotEventParseFailure) => T,
    autonomousPermissions?: Permissions,
): Promise<T> {
    const parsed = verifyAndDecodeNotification(
        factory.env.openchatPublicKey,
        signature,
        rawNotification,
    );
    if (parsed.kind === "bot_event_wrapper") {
        const scope = scopeFromBotEventWrapper(parsed);
        if (scope !== undefined) {
            const client = factory.createClientInAutonomouseContext(
                scope,
                parsed.apiGateway,
                autonomousPermissions,
            );
            return handler(client, parsed.event, parsed.apiGateway);
        } else {
            return error({ kind: "bot_event_parse_failure", error: "Invalid scope" });
        }
    } else {
        return error(parsed);
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
