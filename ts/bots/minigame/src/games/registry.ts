// The games the bot hosts. Each is a choice of the `/play` command, with its card's text and
// limits, and how to make one and read one back from the store. Another game adds an entry here,
// its rules under `games/`, its requests under `handlers/api.ts` and its view under `app/`.
import type { MiniAppSize } from "@open-ic/openchat-botclient-ts";
import { ChatManRace, type ChatManData } from "./chatman/race";
import { CHATMAN_SETTINGS } from "./chatman/settings";
import { GAME_ID as CHATMAN_ID, MAX_PLAYERS as CHATMAN_MAX_PLAYERS } from "./chatman/types";
import { ChessGame, type ChessData } from "./chess/chess";
import { CHESS_SETTINGS } from "./chess/settings";
import { GAME_ID as CHESS_ID } from "./chess/types";
import { CrateRace, type CratesData } from "./crates/race";
import { CRATES_SETTINGS } from "./crates/settings";
import { GAME_ID as CRATES_ID, MAX_PLAYERS as CRATES_MAX_PLAYERS } from "./crates/types";
import { Duel, type DuelData } from "./duel/duel";
import type { DuelRules, Position } from "./duel/types";
import { FOUR_IN_A_ROW } from "./fourinarow/rules";
import { HEX } from "./hex/rules";
import { MazeRace, type MazeData } from "./maze/race";
import { MAZE_SETTINGS } from "./maze/settings";
import { GAME_ID as MAZE_ID, MAX_PLAYERS as MAZE_MAX_PLAYERS } from "./maze/types";
import { MinesweeperRace, type MinesData } from "./minesweeper/race";
import { MINESWEEPER_SETTINGS } from "./minesweeper/settings";
import {
    GAME_ID as MINESWEEPER_ID,
    MAX_PLAYERS as MINESWEEPER_MAX_PLAYERS,
} from "./minesweeper/types";
import { REVERSI } from "./reversi/rules";
import type { Game, GameKind, Host } from "./game";
import { Race2048, type Race2048Data } from "./race2048/race";
import { RACE_SETTINGS } from "./race2048/settings";
import { GAME_ID as RACE_ID, MAX_PLAYERS } from "./race2048/types";
import type { SettingSpec, Settings } from "./settings";
import { WordRace, type WordsData } from "./words/race";
import { WORDS_SETTINGS } from "./words/settings";
import { GAME_ID as WORDS_ID, MAX_PLAYERS as WORDS_MAX_PLAYERS } from "./words/types";

/** What a game can be made with, from the bot's config */
export type GameConfig = {
    /** A race's settings unless the host sets them, eg. a quick race for a test */
    raceSettings?: Settings;
};

export type GameType = {
    /**
     * The `/play` command's value, the `game` in the shared state, the `kind` in the store and the
     * app's name in the bot's definition, which its card names: 1 to 50 lowercase letters, digits,
     * hyphens or underscores
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
     * What can be set, each a choice among a few values with a default: the host's form in the
     * lobby, which the page draws from the declaration.
     */
    settings: readonly SettingSpec[];
    /**
     * The size the page is laid out for, in CSS pixels. The card shows the page at that aspect
     * ratio, as wide as the card, so this is what it's drawn at unless the player goes full screen.
     */
    appSize: MiniAppSize;
    /**
     * A new game, as `/play` posts one, with its default settings and the host, the user who ran
     * it
     */
    create: (config: GameConfig, host: Host | undefined) => Game;
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
    create: (config, host) => Race2048.create({ settings: config.raceSettings, host }),
    fromJson: (data) => new Race2048(data as Race2048Data),
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
    create: (_config, host) => ChessGame.create({ host }),
    fromJson: (data) => new ChessGame(data as ChessData),
};

/**
 * A duel (`games/duel`): two players, and anyone can watch. The card says only that, as who goes
 * first and the time are settings, shown in the lobby. The frame is portrait: a player above the
 * board and a player below it.
 */
function duelType<M, P extends Position<M>>(
    rules: DuelRules<M, P>,
    appSize: MiniAppSize,
): GameType {
    return {
        id: rules.kind,
        title: rules.title,
        image: `app/${rules.kind}.svg`,
        cardText: `**${rules.title}** · two players, anyone can watch`,
        maxPlayers: 2,
        spectators: true,
        settings: rules.settings,
        appSize,
        create: (_config, host) => Duel.create(rules, { host }),
        fromJson: (data) => new Duel(rules, data as DuelData<M>),
    };
}

export const FOUR = duelType(FOUR_IN_A_ROW, { width: 440, height: 600 });

export const REVERSI_GAME = duelType(REVERSI, { width: 440, height: 640 });

// The board's wider than it's tall
export const HEX_GAME = duelType(HEX, { width: 440, height: 580 });

export const MAZE: GameType = {
    id: MAZE_ID,
    title: "Maze Race",
    image: "app/maze.svg",
    // One line, as the others': the maze's size and the time are settings, shown in the lobby
    cardText: `**Maze Race** · up to ${MAZE_MAX_PLAYERS} players, live`,
    maxPlayers: MAZE_MAX_PLAYERS,
    spectators: true,
    settings: MAZE_SETTINGS,
    // A portrait frame: the maze, with the racers under it
    appSize: { width: 440, height: 640 },
    create: (_config, host) => MazeRace.create({ host }),
    fromJson: (data) => new MazeRace(data as MazeData),
};

export const CHATMAN: GameType = {
    id: CHATMAN_ID,
    title: "ChatMan",
    image: "app/chatman.svg",
    // One line, as the others': the time and the lives are settings, shown in the lobby
    cardText: `**ChatMan** · up to ${CHATMAN_MAX_PLAYERS} players, live`,
    maxPlayers: CHATMAN_MAX_PLAYERS,
    spectators: true,
    settings: CHATMAN_SETTINGS,
    // A portrait frame: the maze, with everyone's scores under it
    appSize: { width: 440, height: 720 },
    create: (_config, host) => ChatManRace.create({ host }),
    fromJson: (data) => new ChatManRace(data as ChatManData),
};

export const MINESWEEPER: GameType = {
    id: MINESWEEPER_ID,
    title: "Minesweeper Race",
    image: "app/minesweeper.svg",
    // One line, as the others': the field's size and the time are settings, shown in the lobby
    cardText: `**Minesweeper Race** · up to ${MINESWEEPER_MAX_PLAYERS} players`,
    maxPlayers: MINESWEEPER_MAX_PLAYERS,
    spectators: true,
    settings: MINESWEEPER_SETTINGS,
    // A portrait frame: the field, with how far everyone's got under it
    appSize: { width: 440, height: 720 },
    create: (_config, host) => MinesweeperRace.create({ host }),
    fromJson: (data) => new MinesweeperRace(data as MinesData),
};

export const WORD_RACE: GameType = {
    id: WORDS_ID,
    title: "Word Race",
    image: "app/words.svg",
    // One line, as the others': the time is a setting, shown in the lobby
    cardText: `**Word Race** · up to ${WORDS_MAX_PLAYERS} players`,
    maxPlayers: WORDS_MAX_PLAYERS,
    spectators: true,
    settings: WORDS_SETTINGS,
    // A portrait frame: the racer's guesses and keyboard, with everyone's marks under them
    appSize: { width: 440, height: 720 },
    create: (_config, host) => WordRace.create({ host }),
    fromJson: (data) => new WordRace(data as WordsData),
};

export const CRATE_RACE: GameType = {
    id: CRATES_ID,
    title: "Crate Race",
    image: "app/crates.svg",
    // One line, as the others': the level's difficulty and the time are settings, in the lobby
    cardText: `**Crate Race** · up to ${CRATES_MAX_PLAYERS} players`,
    maxPlayers: CRATES_MAX_PLAYERS,
    spectators: true,
    settings: CRATES_SETTINGS,
    // A portrait frame: the level, with how far everyone's got under it
    appSize: { width: 440, height: 720 },
    create: (_config, host) => CrateRace.create({ host }),
    fromJson: (data) => new CrateRace(data as CratesData),
};

export const GAMES: readonly GameType[] = [
    RACE_2048,
    CHESS,
    FOUR,
    REVERSI_GAME,
    MAZE,
    CHATMAN,
    MINESWEEPER,
    HEX_GAME,
    WORD_RACE,
    CRATE_RACE,
];

/** The games played as a duel (`games/duel`), whose moves and resignations are the same requests */
export const DUELS: readonly GameKind[] = [FOUR, REVERSI_GAME, HEX_GAME].map((game) => game.id);

export function gameType(id: string | undefined): GameType | undefined {
    return GAMES.find((game) => game.id === id);
}
