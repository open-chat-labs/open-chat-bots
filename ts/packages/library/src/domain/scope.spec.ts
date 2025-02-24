import { describe, expect, test } from "vitest";
import { MergedActionChatScope, MergedActionCommunityScope, MergedActionScope } from "./scope";
import { ChannelIdentifier, CommunityIdentifier } from "./identifiers";

describe("scope serialisation", () => {
    test("roundtrip community action scope", () => {
        const scope = new MergedActionCommunityScope(new CommunityIdentifier("12345"));
        const scopeStr = scope.toString();
        const newScope = MergedActionScope.fromString(scopeStr);
        expect(scope).toMatchObject(scope);
        expect(
            newScope.isCommunityScope() && newScope.communityId instanceof CommunityIdentifier,
        ).toBe(true);
    });

    test("rountrip chat action scope", () => {
        const scope = new MergedActionChatScope(new ChannelIdentifier("12345", 12345));
        const scopeStr = scope.toString();
        const newScope = MergedActionScope.fromString(scopeStr);
        expect(scope).toMatchObject(scope);
        if (newScope.isChatScope()) {
            expect(newScope.chat).instanceOf(ChannelIdentifier);
            if (newScope.chat.isChannel()) {
                expect(newScope.chat.communityId).toEqual("12345");
                expect(newScope.chat.channelId).toEqual(12345);
            }
        }
    });
});
