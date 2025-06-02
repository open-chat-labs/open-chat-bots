import { describe, expect, test } from "vitest";
import { parseBotNotification } from "./botEventParser";

describe("bot event parsing", () => {
    test("bot uninstall event", () => {
        const input = JSON.stringify({
            g: "umunu-kh777-77774-qaaca-cai",
            e: {
                l: {
                    u: {
                        u: "w7lou-c7777-77774-qaamq-cai",
                        l: { Group: "wwifi-ux777-77774-qaana-cai" },
                    },
                },
            },
        });

        const parsed = parseBotNotification(input);
        expect(parsed.kind).toEqual("bot_event_wrapper");
        if (parsed.kind === "bot_event_wrapper") {
            expect(parsed.apiGateway).toEqual("umunu-kh777-77774-qaaca-cai");
            expect(parsed.event.kind).toEqual("bot_uninstalled_event");
        }
    });
});
