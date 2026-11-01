// Players' names, looked up from OpenChat by user id, as the MiniApp service's tokens only carry
// ids. The names go in the shared state, so the app can label each board.
import type { BotClientFactory } from "@open-ic/openchat-botclient-ts";

const KEEP_MS = 60 * 60 * 1000;
/** A join is answered within 5 seconds, so a lookup gets less than that */
const TIMEOUT_MS = 3000;

type Known = { name: string; username: string; until: number };

export class Names {
    readonly #cache = new Map<string, Known>();

    constructor(private readonly factory: BotClientFactory) {}

    /** The user's display name, or username, or a stand-in from their id if OpenChat doesn't say */
    async lookup(userId: string): Promise<string> {
        return (await this.#known(userId))?.name ?? fallbackName(userId);
    }

    /** The user's username, at most `KEEP_MS` old, or undefined if OpenChat doesn't say */
    async username(userId: string): Promise<string | undefined> {
        return (await this.#known(userId))?.username;
    }

    async #known(userId: string): Promise<Known | undefined> {
        const cached = this.#cache.get(userId);
        if (cached !== undefined && cached.until > Date.now()) return cached;
        try {
            const response = await withTimeout(
                this.factory.createGlobalClient().userSummary(userId),
                TIMEOUT_MS,
            );
            if (response.kind === "success") {
                const { displayName, username } = response.user;
                const known = {
                    name: displayName?.trim() || username,
                    username,
                    until: Date.now() + KEEP_MS,
                };
                this.#cache.set(userId, known);
                return known;
            }
        } catch (err) {
            console.warn(`Couldn't look up ${userId}'s name:`, err);
        }
        return undefined;
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
