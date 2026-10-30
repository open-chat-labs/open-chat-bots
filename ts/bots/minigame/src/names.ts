// Players' names, looked up from OpenChat by user id, as the MiniApp service's tokens only carry
// ids. The names go in the shared state, so the app can label each board, and in the card's result.
import type { BotClientFactory } from "@open-ic/openchat-botclient-ts";

const KEEP_MS = 60 * 60 * 1000;
/** A join is answered within 5 seconds, so a lookup gets less than that */
const TIMEOUT_MS = 3000;

export class Names {
    readonly #cache = new Map<string, { name: string; until: number }>();

    constructor(private readonly factory: BotClientFactory) {}

    /** The user's display name, or username, or a stand-in from their id if OpenChat doesn't say */
    async lookup(userId: string): Promise<string> {
        const cached = this.#cache.get(userId);
        if (cached !== undefined && cached.until > Date.now()) return cached.name;
        let name: string | undefined;
        try {
            const response = await withTimeout(
                this.factory.createGlobalClient().userSummary(userId),
                TIMEOUT_MS,
            );
            if (response.kind === "success") {
                name = response.user.displayName?.trim() || response.user.username;
            }
        } catch (err) {
            console.warn(`Couldn't look up ${userId}'s name:`, err);
        }
        if (name === undefined) return fallbackName(userId);
        this.#cache.set(userId, { name, until: Date.now() + KEEP_MS });
        return name;
    }
}

export function fallbackName(userId: string): string {
    return `Player ${userId.slice(0, 5)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}
