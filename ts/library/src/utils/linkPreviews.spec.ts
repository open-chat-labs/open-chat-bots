import { afterEach, describe, expect, test, vi } from "vitest";
import {
    clearOgPreviewCache,
    extractEnabledLinks,
    fetchOgPreviews,
    fetchOgPreviewsForText,
} from "./linkPreviews";

const PROXY = "https://preview.test";

function mockFetch(impl: (url: string) => Promise<unknown> | unknown) {
    const spy = vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input))));
    vi.stubGlobal("fetch", spy);
    return spy;
}

function okResponse(body: unknown) {
    return { ok: true, json: () => Promise.resolve(body) };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearOgPreviewCache();
});

describe("extractEnabledLinks", () => {
    test("no text yields no links", () => {
        expect(extractEnabledLinks(undefined)).toEqual([]);
        expect(extractEnabledLinks("")).toEqual([]);
    });

    test("text with no links yields no links", () => {
        expect(extractEnabledLinks("just some words, no links here")).toEqual([]);
    });

    test("extracts a bare url", () => {
        expect(extractEnabledLinks("look at https://example.com/thing")).toEqual([
            "https://example.com/thing",
        ]);
    });

    test("extracts the destination of a markdown link, not the display text", () => {
        expect(
            extractEnabledLinks("[Some Title](https://www.youtube.com/watch?v=abc123)"),
        ).toEqual(["https://www.youtube.com/watch?v=abc123"]);
    });

    test("markdown link whose display text is itself a url yields only the destination", () => {
        expect(
            extractEnabledLinks("[https://display.example.com](https://destination.example.com/x)"),
        ).toEqual(["https://destination.example.com/x"]);
    });

    test("caps at 3 previews", () => {
        const text = [1, 2, 3, 4, 5].map((i) => `https://example.com/${i}`).join(" ");
        expect(extractEnabledLinks(text)).toEqual([
            "https://example.com/1",
            "https://example.com/2",
            "https://example.com/3",
        ]);
    });

    test("caps at 3 previews for newline joined markdown links", () => {
        // This is the shape of message the YouTube bot posts
        const text = [1, 2, 3, 4, 5]
            .map((i) => `[Video number ${i}](https://www.youtube.com/watch?v=vid${i})`)
            .join("\n");
        expect(extractEnabledLinks(text)).toEqual([
            "https://www.youtube.com/watch?v=vid1",
            "https://www.youtube.com/watch?v=vid2",
            "https://www.youtube.com/watch?v=vid3",
        ]);
    });

    test("de-duplicates repeated urls before applying the cap", () => {
        const text = "https://example.com/a https://example.com/a https://example.com/b";
        expect(extractEnabledLinks(text)).toEqual(["https://example.com/a", "https://example.com/b"]);
    });

    test("skips links to OpenChat messages", () => {
        const text = [
            "https://oc.app/community/abcdef/channel/123/45",
            "https://oc.app/group/abcdef/45",
            "https://example.com/keep",
        ].join(" ");
        expect(extractEnabledLinks(text)).toEqual(["https://example.com/keep"]);
    });

    test("keeps non-message OpenChat links", () => {
        expect(extractEnabledLinks("https://oc.app/blog/something")).toEqual([
            "https://oc.app/blog/something",
        ]);
    });

    test("strips the LINK_REMOVED marker", () => {
        expect(extractEnabledLinks("https://example.com/a#LINK_REMOVED")).toEqual([
            "https://example.com/a",
        ]);
    });

    test("de-duplicates a url against its own LINK_REMOVED form", () => {
        // The marker is stripped before de-duplication, so these collapse to one entry rather
        // than surviving as two and burning two of the three preview slots on one link.
        expect(
            extractEnabledLinks("https://example.com/a https://example.com/a#LINK_REMOVED"),
        ).toEqual(["https://example.com/a"]);
    });

    test("marker-stripped duplicates do not eat into the cap", () => {
        const text = [
            "https://example.com/1",
            "https://example.com/1#LINK_REMOVED",
            "https://example.com/2",
            "https://example.com/3",
        ].join(" ");
        expect(extractEnabledLinks(text)).toEqual([
            "https://example.com/1",
            "https://example.com/2",
            "https://example.com/3",
        ]);
    });
});

describe("fetchOgPreviews", () => {
    test("makes no http calls when there are no urls", async () => {
        const spy = mockFetch(() => okResponse({ title: "nope" }));
        expect(await fetchOgPreviews([], PROXY)).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    test("makes no http calls when the text contains no links", async () => {
        const spy = mockFetch(() => okResponse({ title: "nope" }));
        expect(await fetchOgPreviewsForText("no links at all", PROXY)).toEqual([]);
        expect(await fetchOgPreviewsForText(undefined, PROXY)).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    test("maps the camelCase service response onto the wire type", async () => {
        mockFetch(() =>
            okResponse({
                title: "A title",
                description: "A description",
                image: "https://example.com/img.png",
                imageWidth: 800,
                imageHeight: 600,
            }),
        );
        expect(await fetchOgPreviews(["https://example.com/a"], PROXY)).toEqual([
            {
                url: "https://example.com/a",
                title: "A title",
                description: "A description",
                image: { url: "https://example.com/img.png", width: 800, height: 600 },
            },
        ]);
    });

    test("omits the image when dimensions are missing or zero", async () => {
        mockFetch((url) =>
            okResponse(
                url.includes("zero")
                    ? {
                          title: "t",
                          image: "https://example.com/img.png",
                          imageWidth: 0,
                          imageHeight: 0,
                      }
                    : { title: "t", image: "https://example.com/img.png" },
            ),
        );
        const previews = await fetchOgPreviews(
            ["https://example.com/zero", "https://example.com/missing"],
            PROXY,
        );
        expect(previews).toHaveLength(2);
        expect(previews.every((p) => p.image === undefined)).toBe(true);
        expect(previews.every((p) => p.description === "")).toBe(true);
    });

    test("a url and its LINK_REMOVED form are fetched only once", async () => {
        const spy = mockFetch(() => okResponse({ title: "t" }));
        const previews = await fetchOgPreviewsForText(
            "https://example.com/a https://example.com/a#LINK_REMOVED",
            PROXY,
        );
        expect(previews).toHaveLength(1);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    test("trims a trailing slash off the configured proxy url", async () => {
        const spy = mockFetch(() => okResponse({ title: "t" }));
        await fetchOgPreviews(["https://example.com/a"], "https://preview.test/");
        expect(String(spy.mock.calls[0][0])).toBe(
            "https://preview.test/preview?url=https%3A%2F%2Fexample.com%2Fa",
        );
    });

    test("treats a response with no title as no preview", async () => {
        mockFetch(() => okResponse({ description: "no title here", badResponse: true }));
        expect(await fetchOgPreviews(["https://example.com/a"], PROXY)).toEqual([]);
    });

    test("fetches the urls concurrently", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        mockFetch(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            inFlight--;
            return okResponse({ title: "t" });
        });
        await fetchOgPreviews(
            ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
            PROXY,
        );
        expect(maxInFlight).toBe(3);
    });

    describe("never throws", () => {
        test("when the service rejects", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(() => Promise.reject(new Error("network is down"))),
            );
            expect(await fetchOgPreviewsForText("see https://example.com/a", PROXY)).toEqual([]);
        });

        test("when the service throws synchronously", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(() => {
                    throw new Error("boom");
                }),
            );
            expect(await fetchOgPreviewsForText("see https://example.com/a", PROXY)).toEqual([]);
        });

        test("when the service returns a non-ok status", async () => {
            mockFetch(() => ({ ok: false, status: 429, json: () => Promise.resolve({}) }));
            expect(await fetchOgPreviewsForText("see https://example.com/a", PROXY)).toEqual([]);
        });

        test("when the service returns malformed json", async () => {
            mockFetch(() => ({ ok: true, json: () => Promise.reject(new Error("not json")) }));
            expect(await fetchOgPreviewsForText("see https://example.com/a", PROXY)).toEqual([]);
        });

        test("when one url fails and another succeeds", async () => {
            mockFetch((url) => {
                if (url.includes("bad")) throw new Error("boom");
                return okResponse({ title: "good" });
            });
            const previews = await fetchOgPreviews(
                ["https://example.com/bad", "https://example.com/good"],
                PROXY,
            );
            expect(previews.map((p) => p.url)).toEqual(["https://example.com/good"]);
        });

        test("when the request never settles (timeout aborts it)", async () => {
            // Simulate the service hanging - the AbortSignal should reject the fetch
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    (_input: RequestInfo | URL, init?: RequestInit) =>
                        new Promise((_resolve, reject) => {
                            init?.signal?.addEventListener("abort", () =>
                                reject(new Error("aborted")),
                            );
                        }),
                ),
            );
            vi.useFakeTimers();
            const promise = fetchOgPreviewsForText("see https://example.com/a", PROXY);
            await vi.advanceTimersByTimeAsync(6000);
            expect(await promise).toEqual([]);
        });
    });
});

describe("preview cache", () => {
    test("repeated sends of the same url only hit the service once", async () => {
        const spy = mockFetch(() => okResponse({ title: "t" }));
        const text = "check out https://example.com/a";
        await fetchOgPreviewsForText(text, PROXY);
        await fetchOgPreviewsForText(text, PROXY);
        await fetchOgPreviewsForText(text, PROXY);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    test("concurrent sends of the same url coalesce into one request", async () => {
        const spy = mockFetch(async () => {
            await Promise.resolve();
            return okResponse({ title: "t" });
        });
        const text = "check out https://example.com/a";
        const results = await Promise.all([
            fetchOgPreviewsForText(text, PROXY),
            fetchOgPreviewsForText(text, PROXY),
            fetchOgPreviewsForText(text, PROXY),
        ]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(results.every((r) => r.length === 1)).toBe(true);
    });

    test("failures are not remembered for long", async () => {
        vi.useFakeTimers();
        let fail = true;
        const spy = mockFetch(() => (fail ? { ok: false } : okResponse({ title: "t" })));
        const text = "check out https://example.com/a";

        expect(await fetchOgPreviewsForText(text, PROXY)).toEqual([]);
        // still within the negative ttl - no second request
        expect(await fetchOgPreviewsForText(text, PROXY)).toEqual([]);
        expect(spy).toHaveBeenCalledTimes(1);

        fail = false;
        vi.setSystemTime(Date.now() + 60_000);
        const previews = await fetchOgPreviewsForText(text, PROXY);
        expect(previews).toHaveLength(1);
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
