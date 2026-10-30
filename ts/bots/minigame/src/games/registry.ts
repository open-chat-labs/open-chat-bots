// The games the bot hosts. Each is a choice of the `/play` command, with its card's text and
// limits, and how to make one and read one back from the store. Another game adds an entry here,
// its rules under `games/`, its requests under `handlers/api.ts` and its view under `app/`.
import type { MiniAppSize } from "@open-ic/openchat-botclient-ts";
import { ChessGame, type ChessData } from "./chess/chess";
import { GAME_ID as CHESS_ID, TIME_PER_SIDE_MS } from "./chess/types";
import type { Game, GameKind } from "./game";
import { Race2048, type RaceData } from "./race2048/race";
import { GAME_ID as RACE_ID, MAX_PLAYERS, TARGET, TIME_LIMIT_MS } from "./race2048/types";

/** What a game can be made with, from the bot's config */
export type GameConfig = {
    /** The tile which wins a race, if not 2048 */
    raceTarget?: number;
    /** How long a race lasts, in ms, if not 10 minutes */
    raceTimeLimit?: number;
};

export type GameType = {
    /**
     * The `/play` command's value, the `game` in the shared state, the `kind` in the store and the
     * app's name in the bot's definition, which its card names
     */
    id: GameKind;
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
    /** A new game, as `/play` posts one */
    create: (config: GameConfig) => Game;
    /** A game from what the store wrote of it, `Game.toJson()` */
    fromJson: (data: unknown) => Game;
};

export const RACE_2048: GameType = {
    id: RACE_ID,
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
    create: (config) =>
        Race2048.create({ target: config.raceTarget, timeLimit: config.raceTimeLimit }),
    fromJson: (data) => new Race2048(data as RaceData),
};

export const CHESS: GameType = {
    id: CHESS_ID,
    title: "Chess",
    image: "app/chess.svg",
    cardText:
        `**Chess** · ${TIME_PER_SIDE_MS / 60_000} minutes each\n` +
        "Two players, anyone can watch. A coin decides who's White.",
    maxPlayers: 2,
    spectators: true,
    // A portrait frame: a clock each side of the board, with the moves under it
    appSize: { width: 440, height: 740 },
    create: () => ChessGame.create(),
    fromJson: (data) => new ChessGame(data as ChessData),
};

export const GAMES: readonly GameType[] = [RACE_2048, CHESS];

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
