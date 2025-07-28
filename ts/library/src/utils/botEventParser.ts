/* eslint-disable @typescript-eslint/no-explicit-any */
import { AssertError } from "@sinclair/typebox/value";
import type { BotEventResult } from "../domain/bot_events";
import { botEventWrapper } from "../mapping";
import { MsgpackCanisterAgent } from "../services/canisterAgent/msgpack";
import { BotEventWrapper as ApiBotEventWrapper } from "../typebox/typebox";


export function parseBotNotification(json: unknown): BotEventResult {
    try {
        if (typeof json === "string") {
            json = JSON.parse(json);
        }
        const validated = MsgpackCanisterAgent.validate(json, ApiBotEventWrapper);
        return botEventWrapper(validated);
    } catch (err) {
        console.error(
            "Validation failed for bot event: ",
            JSON.stringify(json),
            err instanceof AssertError ? JSON.stringify(err.error) : undefined,
        );
        return { kind: "bot_event_parse_failure", error: err };
        throw err;
    }
}
