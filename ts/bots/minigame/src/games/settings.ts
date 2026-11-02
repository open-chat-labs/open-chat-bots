// A game's settings, as a game declares them: each is a choice among a few values, with a
// default. A game starts with the defaults, the game's host changes them from the lobby, and the
// page draws the lobby's form from the same declaration, so a game adds a setting by declaring it.

export type SettingSpec = {
    /** The key in the game's settings, and the form field's name */
    id: string;
    label: string;
    choices: { value: number; label: string }[];
    default: number;
};

/** A game's settings by id, each one of its choices */
export type Settings = Record<string, number>;

export type ParsedSettings = { ok: true; settings: Settings } | { ok: false; error: string };

/**
 * The settings in `input`, an object of values by id, each checked to be one of its choices.
 * Ids that aren't settings are refused, and settings left out are left out.
 */
export function parseSettings(specs: readonly SettingSpec[], input: unknown): ParsedSettings {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return { ok: false, error: "Settings are an object of values by name" };
    }
    const settings: Settings = {};
    for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
        const spec = specs.find((s) => s.id === id);
        if (spec === undefined) return { ok: false, error: `There's no setting "${id}"` };
        const number = typeof value === "bigint" ? Number(value) : value;
        if (typeof number !== "number" || !spec.choices.some((c) => c.value === number)) {
            const choices = spec.choices.map((c) => c.value).join(", ");
            return { ok: false, error: `${spec.label} is one of ${choices}` };
        }
        settings[id] = number;
    }
    return { ok: true, settings };
}

/** Every setting's default */
export function defaultSettings(specs: readonly SettingSpec[]): Settings {
    return Object.fromEntries(specs.map((s) => [s.id, s.default]));
}
