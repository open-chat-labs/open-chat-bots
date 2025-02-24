import { expect, test } from "vitest";
import { decodeApiKey } from "./decoding";

test("decoding an api key", () => {
    const apiKey =
        "eyJnYXRld2F5IjoiYnI1ZjctN3VhYWEtYWFhYWEtcWFhY2EtY2FpIiwiYm90X2lkIjoiY252bnItemR3Y28tbG5qczYtamFraWEiLCJzY29wZSI6eyJDaGF0Ijp7Ikdyb3VwIjoiZHpoMjItbnVhYWEtYWFhYWEtcWFhb2EtY2FpIn19LCJzZWNyZXQiOiIyNDU0ODc2NjE2NzY2NzAzMzM4OTA4Nzk0MDU5Mzk2MzgzMTQwODIiLCJwZXJtaXNzaW9ucyI6eyJjb21tdW5pdHkiOjU3LCJtZXNzYWdlIjo1MTV9fQ";

    const decoded = decodeApiKey(apiKey);

    expect(decoded.bot).toBe("cnvnr-zdwco-lnjs6-jakia");
    expect(decoded.bot_api_gateway).toBe("br5f7-7uaaa-aaaaa-qaaca-cai");
    expect(decoded.hasCommunityPermission("ChangeRoles")).toBe(true);
    expect(decoded.hasCommunityPermission("RemoveMembers")).toBe(true);
    expect(decoded.hasCommunityPermission("CreatePublicChannel")).toBe(true);
    expect(decoded.hasCommunityPermission("CreatePrivateChannel")).toBe(true);
    expect(decoded.hasCommunityPermission("InviteUsers")).toBe(false);
    expect(decoded.hasMessagePermission("Text")).toBe(true);
    expect(decoded.hasMessagePermission("Image")).toBe(true);
    expect(decoded.hasMessagePermission("Crypto")).toBe(false);
});
