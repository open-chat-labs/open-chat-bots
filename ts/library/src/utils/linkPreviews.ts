import type { OgPreview, OgPreviewImage } from "../typebox/typebox";

// Mirrors the behaviour of the OpenChat web client (openchat-shared/src/utils/linkPreviews.ts)
// so that messages sent by bots get the same previews as messages sent by users.

// Originally taken from here - https://stackoverflow.com/a/6041965
const URL_REGEX = new RegExp(
    `(https?):\\/\\/(localhost|[\\w_-]+(?:(?:\\.[\\w_-]+)+))([\\w.,@?^=%&:\\/~+#-]*[\\w@?^=%&\\/~+#-])`,
    "g",
);

const communityMessageRegex = /\/community\/([a-z0-9_-]+)\/channel\/(\d+)\/(\d+)(?:\/(\d+))?/i;
const groupMessageRegex = /\/group\/([a-z0-9_-]+)\/(\d+)(?:\/(\d+))?/i;

const LINK_REMOVED = "#LINK_REMOVED";

export const MAX_LINK_PREVIEWS = 3;
export const DEFAULT_PREVIEW_PROXY_URL = "https://dy7sqxe9if6te.cloudfront.net";

const PREVIEW_TIMEOUT_MS = 5000;

// Bots typically fan the *same* message out to many chats, so without a cache we would ask the
// preview service for the same url once per recipient. Entries are keyed by proxy + url and the
// in-flight promise is cached (not just the resolved value) so concurrent sends of the same url
// coalesce into a single request.
const MAX_CACHE_ENTRIES = 500;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for a successful lookup
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for a failure, so a blip is retried soon

// The shape returned by the preview service. Note that these are camelCase.
type OgData = {
    title?: string;
    description?: string;
    image?: string;
    imageAlt?: string;
    imageWidth?: number;
    imageHeight?: number;
};

type CacheEntry = {
    expiry: number;
    promise: Promise<OgData | undefined>;
};

const ogCache = new Map<string, CacheEntry>();

/** Empties the preview cache. Exposed primarily for tests. */
export function clearOgPreviewCache(): void {
    ogCache.clear();
}

function pruneCache(now: number) {
    for (const [key, entry] of ogCache) {
        if (entry.expiry <= now) {
            ogCache.delete(key);
        }
    }
    // Map iterates in insertion order, so this drops the oldest entries first.
    while (ogCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = ogCache.keys().next();
        if (oldest.done) break;
        ogCache.delete(oldest.value);
    }
}

function extractRawUrls(text: string): string[] {
    // Replace [display](url) with just the destination url so that the display text is not
    // matched separately from the (potentially different) href url. Bots very often post
    // markdown links rather than bare urls, so this is the common case not the edge case.
    const withoutMarkdownDisplayText = text.replace(/\[[^\]]*\]\((https?:\/\/[^)]*)\)/g, "$1");
    return withoutMarkdownDisplayText.match(URL_REGEX) ?? [];
}

function isOcUrl(url: URL): boolean {
    return (
        url.hostname === "oc.app" ||
        url.hostname.endsWith(".oc.app") ||
        url.hostname === "localhost"
    );
}

// Returns true if this url points at a message *within* OpenChat. The OpenChat client renders
// those with its own inline preview so we must not ask the preview service about them.
function isOcMessageUrl(urlText: string): boolean {
    let url: URL;
    try {
        url = new URL(urlText);
    } catch {
        return false;
    }
    if (!isOcUrl(url)) return false;
    return communityMessageRegex.test(url.pathname) || groupMessageRegex.test(url.pathname);
}

/**
 * Extracts the urls from the supplied text that we should fetch OpenGraph previews for.
 * Unwraps markdown links, strips the LINK_REMOVED marker, excludes links to OpenChat messages
 * and limits the result to MAX_LINK_PREVIEWS.
 */
export function extractEnabledLinks(text?: string): string[] {
    if (!text) return [];
    const stripped = extractRawUrls(text)
        .map((url) =>
            url.endsWith(LINK_REMOVED) ? url.substring(0, url.length - LINK_REMOVED.length) : url,
        )
        .filter((url) => !isOcMessageUrl(url));

    // De-duplicate *after* stripping the marker, otherwise "https://x" and
    // "https://x#LINK_REMOVED" survive as two entries, get fetched twice and burn two of the
    // three preview slots on one link.
    return [...new Set(stripped)].slice(0, MAX_LINK_PREVIEWS);
}

async function requestOgData(url: string, proxyUrl: string): Promise<OgData | undefined> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    try {
        const base = proxyUrl.replace(/\/+$/, "");
        const response = await fetch(`${base}/preview?url=${encodeURIComponent(url)}`, {
            signal: controller.signal,
        });
        if (!response.ok) return undefined;
        const data = (await response.json()) as OgData;
        // no title means the service could not find anything useful
        return data?.title ? data : undefined;
    } catch {
        return undefined;
    } finally {
        clearTimeout(timeoutId);
    }
}

function fetchOgData(url: string, proxyUrl: string): Promise<OgData | undefined> {
    const key = `${proxyUrl}|${url}`;
    const now = Date.now();
    const cached = ogCache.get(key);
    if (cached !== undefined && cached.expiry > now) {
        return cached.promise;
    }

    pruneCache(now);

    // Cache optimistically with the longer ttl and shorten it if the lookup turned out to
    // fail - that way in-flight requests are still shared while we don't remember failures.
    const entry: CacheEntry = {
        expiry: now + CACHE_TTL_MS,
        promise: requestOgData(url, proxyUrl).then((data) => {
            if (data === undefined) {
                entry.expiry = Date.now() + NEGATIVE_CACHE_TTL_MS;
            }
            return data;
        }),
    };
    ogCache.set(key, entry);
    return entry.promise;
}

function ogPreviewImage(data: OgData): OgPreviewImage | undefined {
    // The service only reports dimensions if the source page provides og:image:width/height.
    // Consumers drop zero-dimension images, so if we don't have both we send no image at all.
    if (!data.image) return undefined;
    const { imageWidth: width, imageHeight: height } = data;
    if (!width || !height) return undefined;
    return { url: data.image, width, height };
}

async function fetchSinglePreview(url: string, proxyUrl: string): Promise<OgPreview | undefined> {
    const data = await fetchOgData(url, proxyUrl);
    if (data?.title === undefined) return undefined;

    return {
        url,
        title: data.title,
        description: data.description ?? "",
        image: ogPreviewImage(data),
    };
}

/**
 * Fetches OpenGraph previews for the supplied urls concurrently.
 *
 * This must *never* throw - a failure to obtain a preview must not stop the message being sent -
 * so every failure mode (bad response, timeout, malformed json, network error) degrades to
 * simply returning fewer previews.
 */
export async function fetchOgPreviews(urls: string[], proxyUrl: string): Promise<OgPreview[]> {
    if (urls.length === 0 || !proxyUrl) return [];
    try {
        const results = await Promise.all(
            urls.map((url) => fetchSinglePreview(url, proxyUrl).catch(() => undefined)),
        );
        return results.filter((r): r is OgPreview => r !== undefined);
    } catch {
        return [];
    }
}

/**
 * Extracts the links from the supplied text and fetches previews for them. Never throws and
 * makes zero http calls if there is no text or the text contains no eligible links.
 */
export async function fetchOgPreviewsForText(
    text: string | undefined,
    proxyUrl: string,
): Promise<OgPreview[]> {
    try {
        return await fetchOgPreviews(extractEnabledLinks(text), proxyUrl);
    } catch {
        return [];
    }
}
