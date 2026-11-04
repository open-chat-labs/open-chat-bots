// Players' usernames by user id, from the bot (`GET /api/names`), so a page names players as they're
// named now, whenever it's opened, as the card does with a mention. Each id is asked about once.
// After a request that fails, the page leaves the bot a while before asking again, as it redraws far
// more often than that; meanwhile it shows the names the state carries.
import type { NamesResponse } from "../games/game";
import { shortId } from "./format";
import type { ViewContext } from "./view";

const RETRY_MS = 30_000;

const usernames = new Map<string, string>();
/** The ids the bot's been asked about, or is being */
const asked = new Set<string>();
let retryAt = 0;

/**
 * What the page calls a user: their username, once the bot has said, or else the name `names` has
 * for them, from the state, or else the ends of their id. `nobody` when there's no one, eg. no
 * winner.
 */
export function nameOf(
    id: string | undefined,
    names?: Readonly<Record<string, string>>,
    nobody = "Nobody",
): string {
    if (id === undefined) return nobody;
    return usernames.get(id) ?? names?.[id] ?? shortId(id);
}

/** Asks the bot about the users it hasn't been asked about, and draws the page again with them */
export function fetchUsernames(ctx: ViewContext, ids: readonly string[]): void {
    const wanted = ids.filter((id) => !asked.has(id));
    if (wanted.length === 0 || Date.now() < retryAt) return;
    for (const id of wanted) asked.add(id);
    void (async () => {
        try {
            const query = encodeURIComponent(wanted.join(","));
            const response = await ctx.oc.fetch(`/api/names?ids=${query}`);
            if (!response.ok) throw new Error(`${response.status}`);
            const { names } = (await response.json()) as NamesResponse;
            for (const [id, username] of Object.entries(names)) usernames.set(id, username);
            ctx.render();
        } catch {
            for (const id of wanted) asked.delete(id);
            retryAt = Date.now() + RETRY_MS;
        }
    })();
}
