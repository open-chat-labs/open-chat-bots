import { decodeApiKey } from "../utils/decoding";
import {
    CommunityIdentifier,
    MergedActionCommunityScope,
    type DecodedApiKey,
    type MergedActionScope,
} from ".";

/**
 * This class makes it easy to maintain a map between MergedBotActionScopes and ApiKeys
 */
export class ActionScopeToApiKeyMap {
    #map: Map<string, string>;
    constructor() {
        this.#map = new Map();
    }

    #bestMatch(scope: MergedActionScope): string | undefined {
        const exact = this.#map.get(scope.toString());
        if (exact !== undefined) {
            return exact;
        }
        if (scope.isChatScope() && scope.chat.isChannel()) {
            return this.#bestMatch(
                new MergedActionCommunityScope(new CommunityIdentifier(scope.chat.communityId)),
            );
        }
    }

    set(apiKey: string) {
        const decoded = decodeApiKey(apiKey);
        this.#map.set(decoded.scope.toString(), apiKey);
    }

    has(scope: MergedActionScope): boolean {
        return this.get(scope) !== undefined;
    }

    get(scope: MergedActionScope): string | undefined {
        return this.#bestMatch(scope);
    }

    delete(scope: MergedActionScope): boolean {
        return this.#map.delete(scope.toString());
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
