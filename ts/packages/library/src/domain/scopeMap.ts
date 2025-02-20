import { decodeApiKey } from "../utils/decoding";
import type { DecodedApiKey, MergedActionScope } from "./bot";

/**
 * This class makes it easy to maintain a map between MergedBotActionScopes and ApiKeys
 */
export class ActionScopeToApiKeyMap {
    #map: Map<string, string>;
    constructor() {
        this.#map = new Map();
    }
    // we're *always* dealing with api key scopes here so we need to remove messageId or thread
    #parseScope(scope: MergedActionScope): string {
        const clone = { ...scope };
        if (clone.kind === "chat") {
            delete clone.messageId;
            delete clone.thread;
        }
        return JSON.stringify(clone);
    }
    set(apiKey: string) {
        const decoded = decodeApiKey(apiKey);
        this.#map.set(this.#parseScope(decoded.scope), apiKey);
    }
    has(scope: MergedActionScope): boolean {
        return this.#map.has(this.#parseScope(scope));
    }
    get(scope: MergedActionScope): string | undefined {
        return this.#map.get(this.#parseScope(scope));
    }
    delete(scope: MergedActionScope): boolean {
        return this.#map.delete(this.#parseScope(scope));
    }
    getAndDecode(scope: MergedActionScope): DecodedApiKey | undefined {
        const key = this.get(scope);
        return key ? decodeApiKey(key) : undefined;
    }
    forEach(fn: (scope: MergedActionScope, apiKey: string) => void) {
        this.#map.forEach((k) => {
            const decoded = decodeApiKey(k);
            fn(decoded.scope, k);
        });
    }
}
