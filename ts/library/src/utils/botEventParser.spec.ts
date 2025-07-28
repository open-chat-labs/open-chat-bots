/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect, test } from "vitest";
import { parseBotNotification } from "./botEventParser";


//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};

describe("bot event parsing", () => {
    test("bot uninstall event", () => {
        const input = JSON.stringify({
            api_gateway: "umunu-kh777-77774-qaaca-cai",
            event: {
                Lifecycle: {
                    Uninstalled: {
                        uninstalled_by: "w7lou-c7777-77774-qaamq-cai",
                        location: { Group: "wwifi-ux777-77774-qaana-cai" },
                    },
                },
            },
            timestamp: 123n
        });

        const parsed = parseBotNotification(input);
        expect(parsed.kind).toEqual("bot_event_wrapper");
        if (parsed.kind === "bot_event_wrapper") {
            expect(parsed.apiGateway).toEqual("umunu-kh777-77774-qaaca-cai");
            expect(parsed.event.kind).toEqual("bot_uninstalled_event");
        }
    });
});
