// Fitting a view to the frame, which is only so tall: in a card, the page can't scroll its board
// into view

/**
 * The height left in the frame for what's in `skip`, eg. a board: what's below the top of `root`,
 * less a little for the page's padding, and less the rest of `root`'s children, margins and all.
 * Measuring lays the page out, so a view does it only when what's round its board has changed.
 */
export function roomFor(root: HTMLElement, skip: readonly Element[]): number {
    let used = 0;
    for (const el of root.children) {
        if (skip.includes(el)) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.position === "fixed") continue;
        // Not offsetHeight, which is rounded: rounded down a few times, they'd overflow the frame
        used +=
            el.getBoundingClientRect().height +
            parseFloat(style.marginTop) +
            parseFloat(style.marginBottom);
    }
    return document.documentElement.clientHeight - root.getBoundingClientRect().top - 16 - used;
}
