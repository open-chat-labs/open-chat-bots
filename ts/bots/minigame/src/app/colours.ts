// The colours the races that draw everyone on one board draw their racers in: the maze race and the
// Dash Race

const COLOURS = [
    "#e8704a",
    "#3f7fd0",
    "#2fa36b",
    "#c94fb5",
    "#d9a400",
    "#20a0b8",
    "#8a5cd6",
    "#d64d6b",
    "#6d8f24",
    "#8c6d4f",
];

/** A racer's colour, by their place in the order they joined */
export function racerColour(i: number): string {
    return COLOURS[i % COLOURS.length];
}
