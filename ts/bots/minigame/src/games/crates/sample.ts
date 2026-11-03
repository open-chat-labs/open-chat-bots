// A level small enough for the tests to follow: a crate in the top corridor with its goal two cells
// on, and another in the bottom one, which the player reaches round through the middle
export const LEVEL = [
    "########",
    "#@-$-.-#",
    "#------#",
    "#-$--.-#",
    "########",
    "########",
    "########",
    "########",
].join("");

/** The moves that solve it: the top crate on, round, and the bottom one on */
export const SOLUTION = "rrr" + "dllld" + "rrr";
