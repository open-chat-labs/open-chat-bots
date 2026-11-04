// A player's moves, from the app, with their player token in `x-oc-jwt`. The bot applies the move
// and answers straight away, so the app needn't wait for the state to come round through the
// service: a racer gets their board, a chess player the new shared state. The game's own player
// list is checked on every request: a player token outlives a removal by up to an hour.
import {
    MINI_APP_TOKEN_HEADER,
    TokenError,
    type MiniAppGame,
} from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import type { Deps } from "../deps";
import type { ChessGame } from "../games/chess/chess";
import type { ActionResponse } from "../games/chess/types";
import type { CrateRace } from "../games/crates/race";
import type { Duel } from "../games/duel/duel";
import type { Position } from "../games/duel/types";
import type { Game, GameKind, NamesResponse } from "../games/game";
import type { MinesweeperRace } from "../games/minesweeper/race";
import type { Race2048 } from "../games/race2048/race";
import { MAX_PLAYERS, type MoveResponse } from "../games/race2048/types";
import { gameType } from "../games/registry";
import { parseSettings } from "../games/settings";
import type { WordRace } from "../games/words/race";

/** What a request did to the game: its answer, and whether the game changed, so it's published */
type Outcome = { result: { ok: boolean }; changed: boolean };

type Act<G extends Game> = (play: G, userId: string, body: unknown) => Outcome;

/**
 * The player the request's token names, and the game it's for, or undefined once the answer's
 * been sent: the token isn't good, or the game's over
 */
async function player(
    req: Request,
    res: Response,
    deps: Deps,
): Promise<{ userId: string; game: MiniAppGame; play: Game } | undefined> {
    let userId: string;
    let game;
    try {
        ({ userId, game } = (await deps.tokens()).verifyPlayer(req.headers[MINI_APP_TOKEN_HEADER]));
    } catch (err) {
        if (err instanceof TokenError) {
            res.status(401).json({ ok: false, error: err.message });
        } else {
            console.error("Couldn't verify the player's token:", err);
            res.status(500).json({ ok: false, error: "Couldn't verify the token" });
        }
        return undefined;
    }
    const entry = deps.store.get(game);
    if (entry === undefined) {
        res.status(404).json({ ok: false, error: "This game is over" });
        return undefined;
    }
    return { userId, game, play: entry.play };
}

async function act<G extends Game>(
    req: Request,
    res: Response,
    deps: Deps,
    kind: GameKind,
    action: Act<G>,
): Promise<void> {
    const p = await player(req, res, deps);
    if (p === undefined) return;
    const { userId, game, play } = p;
    if (play.kind !== kind) {
        res.status(409).json({ ok: false, error: `This isn't a ${kind} game` });
        return;
    }
    if (!play.isPlayer(userId)) {
        res.status(403).json({ ok: false, error: "You aren't in this game" });
        return;
    }
    // The time may have run out since the last sweep: then the game's end is what's published
    const endedNow = play.endIfTimeUp();
    const { result, changed } = action(play as G, userId, req.body);
    if (endedNow || changed) {
        deps.store.save();
        deps.publisher.publish(game);
    }
    res.status(result.ok ? 200 : 409).json(result);
}

/**
 * `POST /api/settings` with `{ "<setting>": value, ... }`: the host's change to the game's settings
 * from the lobby, before the start, published to everyone in it. Anyone seated has a player token,
 * so the game itself says who may change them.
 */
export async function settings(req: Request, res: Response, deps: Deps): Promise<void> {
    const p = await player(req, res, deps);
    if (p === undefined) return;
    const { userId, game, play } = p;
    const parsed = parseSettings(gameType(play.kind)?.settings ?? [], req.body);
    if (!parsed.ok) {
        res.status(400).json(parsed);
        return;
    }
    const result = play.configure(userId, parsed.settings);
    if (!result.ok) {
        res.status(403).json(result);
        return;
    }
    deps.store.save();
    deps.publisher.publish(game);
    res.json({ ok: true, settings: play.settings() });
}

/** A user id, as far as it's worth asking OpenChat about */
const USER_ID = /^[a-z0-9-]{1,63}$/;

/**
 * `GET /api/names?ids=<id>,<id>`: these users' usernames by id, leaving out anyone OpenChat doesn't
 * know, so a page shows a player's username as it is now rather than as it was when they joined.
 * It takes no token: a spectator has none, nor does anyone opening a finished card, and usernames
 * are public. At most a full race's worth at once.
 */
export async function userNames(req: Request, res: Response, deps: Deps): Promise<void> {
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",") : [];
    if (ids.length === 0 || ids.length > MAX_PLAYERS || !ids.every((id) => USER_ID.test(id))) {
        res.status(400).json({ ok: false, error: `Up to ${MAX_PLAYERS} user ids, please` });
        return;
    }
    const names: Record<string, string> = {};
    await Promise.all(
        ids.map(async (id) => {
            const username = await deps.names.username(id);
            if (username !== undefined) names[id] = username;
        }),
    );
    res.setHeader("cache-control", "private, max-age=300");
    res.json({ names } satisfies NamesResponse);
}

// The 2048 race: a move or a restart changes the board, unless the move moved nothing

const raceOutcome = (result: MoveResponse): Outcome => ({
    result,
    changed: result.ok && result.moved,
});

export function raceMove(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<Race2048>(req, res, deps, "2048", (race, userId, body) =>
        raceOutcome(race.move(userId, (body as { direction?: unknown } | undefined)?.direction)),
    );
}

export function raceRestart(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<Race2048>(req, res, deps, "2048", (race, userId) =>
        raceOutcome(race.restart(userId)),
    );
}

// Chess: each answers the new shared state, `{ ok: true, shared }`, or `{ ok: false, error }`
// with a 409 for something the game doesn't allow, eg. a move out of turn

const chessOutcome = (result: ActionResponse): Outcome => ({ result, changed: result.ok });

/** `POST /api/chess/move` with `{ "uci": "e2e4" }`: the squares from and to, eg. "e7e8q" to promote */
export function chessMove(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<ChessGame>(req, res, deps, "chess", (chess, userId, body) =>
        chessOutcome(chess.move(userId, (body as { uci?: unknown } | undefined)?.uci)),
    );
}

/** `POST /api/chess/resign`: the other player wins */
export function chessResign(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<ChessGame>(req, res, deps, "chess", (chess, userId) =>
        chessOutcome(chess.resign(userId)),
    );
}

/** `POST /api/chess/draw`: offers the other player a draw, or accepts theirs if it stands */
export function chessDraw(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<ChessGame>(req, res, deps, "chess", (chess, userId) =>
        chessOutcome(chess.offerDraw(userId)),
    );
}

// The duels, Four in a Row and any other game of two taking turns (`games/duel`): each answers the
// new shared state, `{ ok: true, shared }`, or `{ ok: false, error }` with a 409 for something the
// game doesn't allow, eg. a move out of turn or into a full column

type AnyDuel = Duel<unknown, Position<unknown>>;

type Handler = (req: Request, res: Response, deps: Deps) => Promise<void>;

const duelOutcome = (result: { ok: boolean }): Outcome => ({ result, changed: result.ok });

/** `POST /api/<game>/move` with `{ "move": <move> }`, a move as the game writes it, eg. a column */
export function duelMove(kind: GameKind): Handler {
    return (req, res, deps) =>
        act<AnyDuel>(req, res, deps, kind, (duel, userId, body) =>
            duelOutcome(duel.play(userId, (body as { move?: unknown } | undefined)?.move)),
        );
}

/** `POST /api/<game>/resign`: the other player wins */
export function duelResign(kind: GameKind): Handler {
    return (req, res, deps) =>
        act<AnyDuel>(req, res, deps, kind, (duel, userId) => duelOutcome(duel.resign(userId)));
}

/**
 * A move in a game played live, while the player's socket (`live.ts`) isn't open, eg. as it
 * reconnects, taken as the socket takes it, and answered with the new state, which also goes to
 * everyone live: `POST /api/maze/move` with `{ "move": "left", "n": 7 }`, a racer's move, or
 * `POST /api/chatman/turn` with `{ "turn": "left", "n": 7, "tick": 1234 }`, a ChatMan turn
 */
export function liveMove(kind: GameKind): Handler {
    return (req, res, deps) =>
        act<Game & Required<Pick<Game, "receive">>>(req, res, deps, kind, (game, userId, body) => {
            const result = game.receive(userId, body);
            return {
                result: result.ok ? { ok: true, shared: game.shared() } : result,
                changed: result.changed,
            };
        });
}

/**
 * `POST /api/minesweeper/act` with `{ "acts": [{ "reveal": 12 }, { "flag": 30, "on": true }] }`: a
 * racer's clicks, in order, answered with their board, which only they see while the race is on.
 * No acts at all asks for the board, eg. as the page opens.
 */
export function minesweeperAct(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<MinesweeperRace>(req, res, deps, "minesweeper", (race, userId, body) =>
        race.act(userId, body),
    );
}

/**
 * `POST /api/words/guess` with `{ "guess": "crane" }`: a Word racer's guess, answered with their
 * guesses, marked, which only they see while the race is on. No guess at all asks for them, eg. as
 * the page opens.
 */
export function wordsGuess(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<WordRace>(req, res, deps, "words", (race, userId, body) => race.guess(userId, body));
}

/**
 * `POST /api/crates/path` with `{ "path": "rrdlu" }`: a Crate racer's moves from the level's start,
 * less those undone, answered with their path as the bot has it, which only they see while the race
 * is on. No path at all asks for it, eg. as the page opens.
 */
export function cratesPath(req: Request, res: Response, deps: Deps): Promise<void> {
    return act<CrateRace>(req, res, deps, "crates", (race, userId, body) =>
        race.path(userId, body),
    );
}
