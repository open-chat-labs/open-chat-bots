// The lines of a race's standings, a player's each, in order. A line is kept while its player's in
// the list, and only what's changed in it is touched: the page redraws often, eg. four times a
// second for ChatMan, and a click on a line that's replaced between the press and the release goes
// nowhere.

/**
 * Draws a line for each player in `players`, in order: their line from `rows`, by id, or a new one
 * from `make`, drawn by `draw`, and moved into its place if it isn't there. The lines of anyone no
 * longer in the list are removed.
 */
export function drawRows<P extends { id: string }, R extends { li: HTMLElement }>(
    list: HTMLElement,
    rows: Map<string, R>,
    players: readonly P[],
    make: () => R,
    draw: (row: R, player: P) => void,
): void {
    const seen = new Set<string>();
    for (const player of players) {
        let row = rows.get(player.id);
        if (row === undefined) {
            row = make();
            rows.set(player.id, row);
        }
        draw(row, player);
        const at = list.children[seen.size] ?? null;
        if (at !== row.li) list.insertBefore(row.li, at);
        seen.add(player.id);
    }
    for (const [id, row] of rows) {
        if (!seen.has(id)) {
            row.li.remove();
            rows.delete(id);
        }
    }
}

/** Makes a line one a click on does `action` for its player, eg. shows their board, or not */
export function pickable(li: HTMLElement, id: string, action: string | undefined): void {
    if (action === undefined) {
        delete li.dataset.action;
        delete li.dataset.id;
    } else {
        li.dataset.action = action;
        li.dataset.id = id;
    }
}
