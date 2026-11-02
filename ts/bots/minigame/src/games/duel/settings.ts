// The settings every duel has: who goes first, and each player's time for the whole game. A game
// picks its own minutes. Games share a `/play` parameter by a setting's id, so every duel's "who
// goes first" is one parameter, and its minutes join chess's and the race's.
import type { SettingSpec } from "../settings";

/** The `first` setting's choices, as chess's `white` has them */
export const FIRST_RANDOM = 0;
export const FIRST_IS_HOST = 1;
export const FIRST_IS_OPPONENT = 2;

export const FIRST_SETTING: SettingSpec = {
    id: "first",
    // A noun, as the lobby says who "can change the turn order and the time limit"
    label: "Turn order",
    description: "Who moves first: random, the host, or the host's opponent",
    choices: [
        { value: FIRST_RANDOM, label: "Random" },
        { value: FIRST_IS_HOST, label: "The host first" },
        { value: FIRST_IS_OPPONENT, label: "The host's opponent first" },
    ],
    default: FIRST_RANDOM,
};

/** Each player's minutes for the whole game, among `choices`, `fallback` unless set */
export function minutesSetting(choices: number[], fallback: number): SettingSpec {
    return {
        id: "minutes",
        label: "Time limit",
        description: `Minutes each player has for the whole game, ${fallback} unless set`,
        choices: choices.map((value) => ({
            value,
            label: `${value} minute${value === 1 ? "" : "s"}`,
        })),
        default: fallback,
    };
}
