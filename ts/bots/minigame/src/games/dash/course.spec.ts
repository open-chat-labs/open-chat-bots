import { describe, expect, it } from "vitest";
import {
    AIR,
    buildCourse,
    CHECKPOINT_EVERY,
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
        for (const level of [1, 2, 3]) {
            expect(SECTIONS.filter((s) => s.level === level).length).toBeGreaterThanOrEqual(8);
        }
    });

    it("joins its sections between a flat start and finish, with checkpoints between", () => {
        const sections = pickSections(2, () => 0);
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

    it("picks a course's sections by its difficulty, harder ones after a few of the level below", () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        const levels = (difficulty: number) =>
            pickSections(difficulty, random).map((id) => SECTIONS[id].level);
        expect(levels(1)).toEqual(Array(SECTIONS_PER_COURSE).fill(1));
        expect(levels(2)).toEqual([...Array(4).fill(1), ...Array(8).fill(2)]);
        expect(levels(3)).toEqual([...Array(4).fill(2), ...Array(8).fill(3)]);
        // Every section of a level before any comes round again
        const easy = pickSections(1, random);
        const count = SECTIONS.filter((s) => s.level === 1).length;
        expect(new Set(easy.slice(0, count)).size).toBe(count);
    });
});
