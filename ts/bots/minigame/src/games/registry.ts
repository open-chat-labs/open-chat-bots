// The games the bot hosts. Each is a choice of the `/play` command, and its card's text and limits.
// The 2048 race is the first; another game adds an entry here, its rules under `games/`, its
// requests under `handlers/api.ts` and its view in the app.
import type { MiniAppSize } from "@open-ic/openchat-botclient-ts";
import { RACE_SETTINGS } from "./race2048/settings";
import { GAME_ID, MAX_PLAYERS } from "./race2048/types";
import type { SettingSpec } from "./settings";

export type GameType = {
    /** The `/play` command's value, and the `game` in the shared state */
    id: string;
    title: string;
    /** The card's text, markdown */
    cardText: string;
    maxPlayers: number;
    /** Whether people who aren't playing can watch */
    spectators: boolean;
    /** What can be set: `/play`'s parameters, and the host's form in the lobby */
    settings: readonly SettingSpec[];
    /**
     * The size the page is laid out for, in CSS pixels. The card shows the page at that aspect
     * ratio, as wide as the card, so this is what it's drawn at unless the player goes full screen.
     */
    appSize: MiniAppSize;
};

export const RACE_2048: GameType = {
    id: GAME_ID,
    title: "2048 Race",
    // One line, for where the card shows without its app: replies, previews, notifications. The
    // rules and the settings are in the lobby.
    cardText: `**2048 Race** · up to ${MAX_PLAYERS} players`,
    maxPlayers: MAX_PLAYERS,
    spectators: true,
    settings: RACE_SETTINGS,
    // A portrait frame: the lobby, or a player's board above a row of the others'
    appSize: { width: 480, height: 720 },
};

export const GAMES: readonly GameType[] = [RACE_2048];

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
