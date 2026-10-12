import { describe, expect, test } from "vitest";
import { Channel } from "./channel";
import { CommunityIdentifier } from "./identifiers";

const communityId = new CommunityIdentifier("dgegb-daaaa-aaaar-arlhq-cai");

describe("channel tip permission", () => {
    test("follows the react permission by default", () => {
        const args = new Channel("name", "description")
            .setGroupPermission("reactToMessages", "admin")
            .toInputArgs(communityId);

        expect(args.permissions?.react_to_messages).toBe("Admins");
        expect(args.permissions?.tip_messages).toBe("Admins");
    });

    test("can be set separately from the react permission", () => {
        const args = new Channel("name", "description")
            .setGroupPermission("reactToMessages", "admin")
            .setGroupPermission("tipMessages", "none")
            .toInputArgs(communityId);

        expect(args.permissions?.react_to_messages).toBe("Admins");
        expect(args.permissions?.tip_messages).toBe("None");
    });
});
