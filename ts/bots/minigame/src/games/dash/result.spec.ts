import { describe, expect, it } from "vitest";
import { describeResult, runTime } from "./result";
import { START_TICK } from "./runner";

describe("a Dash Race's result", () => {
    it("times a run from when everyone set off, or from the start, in a race from before", () => {
        expect(runTime(START_TICK + 59)).toBe("1.0s");
        expect(runTime(START_TICK + 3599 + 600)).toBe("1m 10.0s");
        // Before they set off, as a run played through starts
        expect(runTime(START_TICK - 30)).toBe("0.0s");
        expect(runTime(59, 0)).toBe("1.0s");
        const won = { winner: "alice", ended: "flag" } as const;
        const run = { falls: 2, finished: 299, percent: 100 };
        expect(describeResult(won, run, (id) => id)).toBe(
            "alice reached the flag in 2.0s, with 2 falls",
        );
        expect(describeResult(won, run, (id) => id, 0)).toBe(
            "alice reached the flag in 5.0s, with 2 falls",
        );
    });
});
