import { describe, expect, it } from "vitest";
import { runTo } from "./runner";
import { SECTIONS } from "./sections";
import { passage, sectionCourse, sectionRunner, through } from "./solve";

/**
 * The fewest ticks a section of each level gives a player to time a press, or letting go: at 60
 * ticks a second, a third of a second for an easy one, and a tenth for a hard one
 */
const LEEWAY: Readonly<Record<number, number>> = { 1: 20, 2: 6, 3: 6 };

describe("the Dash Race's sections", () => {
    it.each(SECTIONS.map((section, id) => ({ id, section })))(
        "can all be got through, with leeway for their level: section $id",
        ({ section }) => {
            const way = passage(section);
            expect(way).toBeDefined();
            expect(way!.leeway).toBeGreaterThanOrEqual(LEEWAY[section.level]);
            // The way through, as a run, gets a runner through
            const course = sectionCourse(section);
            const r = sectionRunner(course);
            for (let tick = 0; tick < 1000 && r.mode === "run" && !through(course, r); tick++) {
                runTo(course, r, way!.changes, tick);
            }
            expect(through(course, r)).toBe(true);
        },
    );

    it("would show up one a runner can't get through", () => {
        // A wall three tiles high is higher than a jump, and a gap six wide is further
        const wall = ["....###....", "....###....", "....###....", "###########", "###########"];
        expect(passage({ level: 1, rows: wall })).toBeUndefined();
        expect(passage({ level: 1, rows: ["##......##", "##......##"] })).toBeUndefined();
        expect(passage({ level: 1, rows: ["##.....##", "##.....##"] })).toBeDefined();
    });
});
