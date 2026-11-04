import { describe, expect, it } from "vitest";
import {
    AIR,
    buildCourse,
    CHECKPOINT_EVERY,
    LEVEL_SECTIONS,
    pickSections,
    readSection,
    ROWS,
    SECTIONS_PER_COURSE,
    SOLID,
    SPIKE_DOWN,
    SPIKE_UP,
    tileAt,
} from "./course";
import { SECTIONS } from "./sections";

describe("a Dash Race's course", () => {
    it("reads a section's rows, the top first, and refuses one that doesn't start and end flat", () => {
        const read = readSection({ level: 1, rows: ["..v..", "..^..", "#####", "#####"] });
        expect("columns" in read && read.columns[2].slice(0, 5)).toEqual([
            SOLID,
            SOLID,
            SPIKE_UP,
            SPIKE_DOWN,
            AIR,
        ]);
        expect(readSection({ level: 1, rows: ["##.##", "##.##"] })).toEqual({
            columns: expect.any(Array),
        });
        expect(readSection({ level: 1, rows: ["#.###", "#.###"] })).toEqual({
            error: "column 1 isn't flat ground",
        });
        expect(readSection({ level: 1, rows: ["####", "###"] })).toMatchObject({
            error: "rows of different lengths",
        });
        expect(readSection({ level: 1, rows: ["##x##", "#####"] })).toMatchObject({
            error: '"x" in column 2',
        });
    });

    it("has sections that can all be read, of every level", () => {
        for (const [id, section] of SECTIONS.entries()) {
            expect(readSection(section), `section ${id}`).not.toHaveProperty("error");
        }
        // Enough of each level for a course, with some to choose from but the hard ones
        for (const [i, count] of LEVEL_SECTIONS.entries()) {
            expect(SECTIONS.filter((s) => s.level === i + 1).length).toBeGreaterThanOrEqual(
                Math.max(count, 8),
            );
        }
    });

    it("joins its sections between a flat start and finish, with checkpoints between", () => {
        const sections = pickSections(() => 0);
        const course = buildCourse(sections)!;
        const width = sections.reduce((w, id) => w + SECTIONS[id].rows[0].length, 0);
        expect(course.width).toBe(6 + width + 8);
        expect(course.finish).toBe(6 + width + 2);
        expect(course.checkpoints).toHaveLength(SECTIONS_PER_COURSE / CHECKPOINT_EVERY);
        // Each checkpoint on the ground where a section starts
        for (const column of course.checkpoints) {
            expect(tileAt(course, column, 1)).toBe(SOLID);
            expect(tileAt(course, column, 2)).toBe(AIR);
        }
        expect(tileAt(course, -1, 0)).toBe(AIR);
        expect(tileAt(course, 0, ROWS)).toBe(AIR);
        expect(buildCourse([SECTIONS.length])).toBeUndefined();
    });

    it("picks a course's sections, an easy one, then two medium, then hard the rest of the way", () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        const sections = pickSections(random);
        expect(sections.map((id) => SECTIONS[id].level)).toEqual([1, 2, 2, ...Array(9).fill(3)]);
        expect(sections).toHaveLength(SECTIONS_PER_COURSE);
        expect(new Set(sections).size).toBe(SECTIONS_PER_COURSE);
        // The first checkpoint after the start is where the hard ones start
        const course = buildCourse(sections)!;
        const before = (i: number) =>
            6 + sections.slice(0, i).reduce((w, id) => w + SECTIONS[id].rows[0].length, 0);
        expect(course.checkpoints).toEqual([1, before(3), before(6), before(9)]);
        // And another race, another course
        expect(pickSections(random)).not.toEqual(sections);
    });
});
