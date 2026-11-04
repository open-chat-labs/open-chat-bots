// How long something took, as a game's result says it, on the card and on the page alike

/** eg. "45s", "2m 15s", "1h 2m" */
export function duration(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${rest}s`;
    return `${rest}s`;
}
