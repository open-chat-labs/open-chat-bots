// The games the bot hosts. Each is a choice of the `/play` command, and its card's text and limits.
// The 2048 race is the first; another game adds an entry here, its rules under `games/`, its
// requests under `handlers/api.ts` and its view in the app.
import { GAME_ID, MAX_PLAYERS, TARGET } from "./race2048/types";

export type GameType = {
    /** The `/play` command's value, and the `game` in the shared state */
    id: string;
    title: string;
    /** The card's text, markdown */
    cardText: string;
    maxPlayers: number;
    /** Whether people who aren't playing can watch */
    spectators: boolean;
};

export const RACE_2048: GameType = {
    id: GAME_ID,
    title: "2048 Race",
    cardText:
        `**2048 Race** · up to ${MAX_PLAYERS} players\n` +
        `Everyone gets a board. The first to make a ${TARGET} tile wins. ` +
        `Stuck? Restart on a fresh board and keep racing.`,
    maxPlayers: MAX_PLAYERS,
    spectators: true,
};

export const GAMES: readonly GameType[] = [RACE_2048];

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
