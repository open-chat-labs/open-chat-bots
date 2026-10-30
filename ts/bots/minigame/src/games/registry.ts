// The games the bot hosts. Each is a choice of the `/play` command, with its card's text and
// limits, and how to make one and read one back from the store. Another game adds an entry here,
// its rules under `games/`, its requests under `handlers/api.ts` and its view under `app/`.
import type { MiniAppSize } from "@open-ic/openchat-botclient-ts";
import { ChessGame, type ChessData } from "./chess/chess";
import { CHESS_SETTINGS } from "./chess/settings";
import { GAME_ID as CHESS_ID } from "./chess/types";
import type { Game, GameKind, Host } from "./game";
import { Race2048, type RaceData } from "./race2048/race";
import { RACE_SETTINGS } from "./race2048/settings";
import { GAME_ID as RACE_ID, MAX_PLAYERS } from "./race2048/types";
import type { SettingSpec, Settings } from "./settings";

/** What a game can be made with, from the bot's config */
export type GameConfig = {
    /** A race's settings unless the command or the host sets them, eg. a quick race for a test */
    raceSettings?: Settings;
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
     * What can be set, each a choice among a few values with a default: `/play`'s parameters,
     * and the host's form in the lobby. The page draws the form from the same declaration.
     */
    settings: readonly SettingSpec[];
    /**
     * The size the page is laid out for, in CSS pixels. The card shows the page at that aspect
     * ratio, as wide as the card, so this is what it's drawn at unless the player goes full screen.
     */
    appSize: MiniAppSize;
    /**
     * A new game, as `/play` posts one, with the settings its parameters gave, each one of its
     * choices, and the host, the user who ran it
     */
    create: (config: GameConfig, settings: Settings, host: Host | undefined, key: string) => Game;
    /** A game from what the store wrote of it, `Game.toJson()` */
    fromJson: (data: unknown) => Game;
};

export const RACE_2048: GameType = {
    id: RACE_ID,
    title: "2048 Race",
    image: "app/2048.svg",
    // One line, for where the card shows without its app: replies, previews, notifications. The
    // rules and the settings are in the lobby, where the target and the time can change.
    cardText: `**2048 Race** · up to ${MAX_PLAYERS} players`,
    maxPlayers: MAX_PLAYERS,
    spectators: true,
    settings: RACE_SETTINGS,
    // A portrait frame: the lobby, or a player's board above a row of the others'
    appSize: { width: 480, height: 720 },
    create: (config, settings, host, key) =>
        Race2048.create({ settings: { ...config.raceSettings, ...settings }, host, key }),
    fromJson: (data) => new Race2048(data as RaceData),
};

export const CHESS: GameType = {
    id: CHESS_ID,
    title: "Chess",
    image: "app/chess.svg",
    // One line, as the race's: the time and who's White are settings, shown in the lobby
    cardText: "**Chess** · two players, anyone can watch",
    maxPlayers: 2,
    spectators: true,
    settings: CHESS_SETTINGS,
    // A portrait frame: a clock each side of the board, with the moves under it
    appSize: { width: 440, height: 740 },
    create: (_config, settings, host) => ChessGame.create({ settings, host }),
    fromJson: (data) => new ChessGame(data as ChessData),
};

export const GAMES: readonly GameType[] = [RACE_2048, CHESS];

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
