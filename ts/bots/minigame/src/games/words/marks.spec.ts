import { describe, expect, it } from "vitest";
import { closer, closeness, guessed, letterMarks, mark } from "./marks";
import { ANSWERS, OTHER_WORDS } from "./words";

describe("a guess's marks", () => {
    it("say which letters are in place, which are in the word elsewhere, and which aren't", () => {
        expect(mark("crane", "crane")).toBe("22222");
        expect(mark("trace", "crane")).toBe("02212");
        expect(mark("lumpy", "crane")).toBe("00000");
    });

    it("mark a letter in the word only as often as the word has it, its places first", () => {
        // The word's one e is the guess's last, in place, so its others aren't in the word again
        expect(mark("geese", "those")).toBe("00022");
        // The word's two l's are both in place, so the guess's first isn't in the word again
        expect(mark("lolly", "hello")).toBe("01220");
        // The word's one l is elsewhere: the guess's first is marked so, and the others not
        expect(mark("lolly", "hotel")).toBe("12000");
    });

    it("say how close a guess came, and whether it was the word", () => {
        expect(guessed("22222")).toBe(true);
        expect(guessed("22221")).toBe(false);
        expect(guessed("")).toBe(false);
        expect(closeness("21012")).toEqual([2, 2]);
        // Letters in place count before letters elsewhere
        expect(closer("20000", "11111")).toBeLessThan(0);
        expect(closer("21000", "20000")).toBeLessThan(0);
        expect(closer("20000", "02000")).toBe(0);
    });

    it("tell the keyboard the most each letter's been marked", () => {
        const known = letterMarks(["trace", "crane"], ["02212", "22222"]);
        expect(known.get("c")).toBe("2");
        expect(known.get("t")).toBe("0");
        expect(letterMarks(["trace"], ["02212"]).get("c")).toBe("1");
        expect(letterMarks(["lumpy"], ["00000"]).get("l")).toBe("0");
    });
});

describe("the words", () => {
    it("are five lowercase letters, each once, and every answer can be guessed", () => {
        for (const word of [...ANSWERS, ...OTHER_WORDS]) expect(word).toMatch(/^[a-z]{5}$/);
        const all = new Set([...ANSWERS, ...OTHER_WORDS]);
        expect(all.size).toBe(ANSWERS.length + OTHER_WORDS.length);
        expect(ANSWERS.length).toBeGreaterThan(1500);
        expect(all.size).toBeGreaterThan(6000);
        // Plurals of common words and slang are left out of the answers, but can be guessed
        for (const word of ["carts", "notes", "gonna"]) {
            expect(ANSWERS).not.toContain(word);
            expect(all.has(word)).toBe(true);
        }
        for (const word of ["crane", "slate", "pride"]) expect(ANSWERS).toContain(word);
    });
});
