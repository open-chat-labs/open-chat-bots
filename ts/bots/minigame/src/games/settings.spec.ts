import { describe, expect, it } from "vitest";
import { RACE_SETTINGS } from "./race2048/settings";
import { defaultSettings, parseSettings } from "./settings";

describe("parseSettings", () => {
    it("takes each setting given, as a number or a command's bigint, among its choices", () => {
        expect(parseSettings(RACE_SETTINGS, { target: 1024, minutes: BigInt(5) })).toEqual({
            ok: true,
            settings: { target: 1024, minutes: 5 },
        });
        expect(parseSettings(RACE_SETTINGS, {})).toEqual({ ok: true, settings: {} });
    });

    it("refuses a value that isn't a choice, or a setting that doesn't exist", () => {
        expect(parseSettings(RACE_SETTINGS, { target: 1000 })).toEqual({
            ok: false,
            error: "Winning tile is one of 256, 512, 1024, 2048, 4096",
        });
        expect(parseSettings(RACE_SETTINGS, { minutes: "5" })).toMatchObject({ ok: false });
        expect(parseSettings(RACE_SETTINGS, { players: 3 })).toEqual({
            ok: false,
            error: 'There\'s no setting "players"',
        });
        expect(parseSettings(RACE_SETTINGS, [1])).toMatchObject({ ok: false });
        expect(parseSettings(RACE_SETTINGS, null)).toMatchObject({ ok: false });
    });

    it("has a default for each", () => {
        expect(defaultSettings(RACE_SETTINGS)).toEqual({ target: 2048, minutes: 10 });
    });
});
