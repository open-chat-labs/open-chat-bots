// The games the bot hosts. Each is a choice of the `/play` command, and its card's text and limits.
// The 2048 race is the first; another game adds an entry here, its rules under `games/`, its
// requests under `handlers/api.ts` and its view in the app.
import type { MiniAppSize } from "@open-ic/openchat-botclient-ts";
import { GAME_ID, MAX_PLAYERS, TARGET, TIME_LIMIT_MS } from "./race2048/types";

export type GameType = {
    /**
     * The `/play` command's value, the `game` in the shared state, and the app's name in the bot's
     * definition, which its card names
     */
    id: string;
    title: string;
    /**
     * The app's image, a path relative to the bot's endpoint, served as a static file from
     * `src/app/public`. OpenChat shows it in the card's frame box whenever there's no app to show:
     * before the app loads, to someone who can't open the game, and over a finished game with no
     * end state. It's drawn at the app's aspect ratio, cropped to fill.
     */
    image: string;
    /** The card's text, markdown */
    cardText: string;
    maxPlayers: number;
    /** Whether people who aren't playing can watch */
    spectators: boolean;
    /**
     * The size the page is laid out for, in CSS pixels. The card shows the page at that aspect
     * ratio, as wide as the card, so this is what it's drawn at unless the player goes full screen.
     */
    appSize: MiniAppSize;
};

export const RACE_2048: GameType = {
    id: GAME_ID,
    title: "2048 Race",
    image: "app/2048.svg",
    cardText:
        `**2048 Race** · up to ${MAX_PLAYERS} players\n` +
        `Everyone gets a board. The first to make a ${TARGET} tile wins, or the top score ` +
        `after ${TIME_LIMIT_MS / 60_000} minutes. Stuck? Restart on a fresh board and keep racing.`,
    maxPlayers: MAX_PLAYERS,
    spectators: true,
    // A portrait frame: the lobby, or a player's board above a row of the others'
    appSize: { width: 480, height: 720 },
};

export const GAMES: readonly GameType[] = [RACE_2048];

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
