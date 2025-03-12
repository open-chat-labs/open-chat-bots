import { expect, test } from "vitest";
import {
    Permissions,
    type ChatPermission,
    type CommunityPermission,
    type MessagePermission,
} from "../domain";

test("encoding bot permissions", () => {
    const message: MessagePermission[] = ["Audio", "Text", "Crypto"];
    const chat: ChatPermission[] = ["AddMembers", "PinMessages", "ReactToMessages"];
    const community: CommunityPermission[] = ["ChangeRoles", "CreatePrivateChannel"];

    const perm = new Permissions(
        Permissions.encodePermissions({
            community,
            chat,
            message,
        }),
    );

    expect(perm.hasMessagePermission("Audio")).toBe(true);
    expect(perm.hasMessagePermission("Text")).toBe(true);
    expect(perm.hasMessagePermission("Crypto")).toBe(true);
    expect(perm.hasMessagePermission("Image")).toBe(false);

    expect(perm.hasChatPermission("AddMembers")).toBe(true);
    expect(perm.hasChatPermission("PinMessages")).toBe(true);
    expect(perm.hasChatPermission("ReactToMessages")).toBe(true);
    expect(perm.hasChatPermission("ReadChatDetails")).toBe(false);

    expect(perm.hasCommunityPermission("ChangeRoles")).toBe(true);
    expect(perm.hasCommunityPermission("CreatePrivateChannel")).toBe(true);
    expect(perm.hasCommunityPermission("CreatePublicChannel")).toBe(false);
});
