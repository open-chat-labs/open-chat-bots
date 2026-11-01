import type { BotClientFactory } from "@open-ic/openchat-botclient-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackName, Names } from "./names";

type User = { username: string; displayName?: string };

function setUp(users: Record<string, User>) {
    const userSummary = vi.fn(async (id: string) =>
        users[id] === undefined ? { kind: "not_found" } : { kind: "success", user: users[id] },
    );
    const factory = { createGlobalClient: () => ({ userSummary }) } as unknown as BotClientFactory;
    return { names: new Names(factory), userSummary };
}

describe("names", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("gives the display name to seat a player with, and the username on its own", async () => {
        const { names, userSummary } = setUp({ abc: { username: "abc", displayName: " Abc Smith " } });
        expect(await names.lookup("abc")).toBe("Abc Smith");
        expect(await names.username("abc")).toBe("abc");
        // The one lookup answers both
        expect(userSummary).toHaveBeenCalledTimes(1);
    });

    it("seats someone with no display name by their username", async () => {
        const { names } = setUp({ abc: { username: "abc" } });
        expect(await names.lookup("abc")).toBe("abc");
    });

    it("has a stand-in to seat someone unknown with, and no username for them", async () => {
        const { names } = setUp({});
        expect(await names.lookup("nobody")).toBe(fallbackName("nobody"));
        expect(await names.username("nobody")).toBeUndefined();
    });

    it("sees a new username once what it knows is an hour old", async () => {
        const user = { username: "abc" };
        const { names } = setUp({ abc: user });
        expect(await names.username("abc")).toBe("abc");

        user.username = "xyz";
        vi.advanceTimersByTime(60 * 60 * 1000 - 1);
        expect(await names.username("abc")).toBe("abc");
        vi.advanceTimersByTime(1);
        expect(await names.username("abc")).toBe("xyz");
    });
});
