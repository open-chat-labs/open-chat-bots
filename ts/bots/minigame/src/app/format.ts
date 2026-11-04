// What the views write the same way: times on a clock, someone known only by their id, and text
// drawn as HTML

/** A time in minutes and seconds, eg. "4:05", its seconds rounded down unless `round` says */
export function mmss(ms: number, round: (seconds: number) => number = Math.floor): string {
    const seconds = Math.max(0, round(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A player's clock, eg. "4:05", in tenths under ten seconds, eg. "0:07.3" */
export function formatClock(ms: number): string {
    if (ms < 10_000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
    return mmss(ms);
}

/**
 * The time left for a first move, eg. "0:42", in whole seconds even near the end, where a clock
 * shows tenths: so the status line it ends keeps its length, and can't start to wrap between the
 * redraws that fit the board
 */
export function formatFirstMove(ms: number): string {
    return mmss(ms, Math.ceil);
}

/** A user id cut down to its ends, for someone whose name the page doesn't know */
export function shortId(id: string): string {
    return id.length > 13 ? `${id.slice(0, 5)}…${id.slice(-5)}` : id;
}

export function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
