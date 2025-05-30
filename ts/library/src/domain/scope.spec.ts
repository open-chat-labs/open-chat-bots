import { describe, expect, test } from "vitest";
import { ChannelIdentifier, CommunityIdentifier } from "./identifiers";
import { ActionScope, ChatActionScope, CommunityActionScope } from "./scope";

describe("scope serialisation", () => {
    test("roundtrip community action scope", () => {
        const scope = new CommunityActionScope(new CommunityIdentifier("12345"));
        const scopeStr = scope.toString();
        const newScope = ActionScope.fromString(scopeStr);
        expect(scope).toMatchObject(scope);
        expect(
            newScope.isCommunityScope() && newScope.communityId instanceof CommunityIdentifier,
        ).toBe(true);
    });

    test("rountrip chat action scope", () => {
        const scope = new ChatActionScope(new ChannelIdentifier("12345", 12345n));
        const scopeStr = scope.toString();
        const newScope = ActionScope.fromString(scopeStr);
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
