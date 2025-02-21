import { type DecodedApiKey, type RawApiKey } from "../domain";
import { mapApiKey } from "../mapping";

export function decodeApiKey(apiKey: string): DecodedApiKey {
    const buffer = Buffer.from(apiKey, "base64");
    const decoded = buffer.toString("utf-8");
    const json = JSON.parse(decoded);
    return mapApiKey(apiKey, json as RawApiKey);
}
