// A player's moves, from the app, with their player token in `x-oc-jwt`. The bot applies the move
// and answers straight away, so the app needn't wait for the state to come round through the
// service: a racer gets their board, a chess player the new shared state. The game's own player
// list is checked on every request: a player token outlives a removal by up to an hour.
import { MINI_APP_TOKEN_HEADER, TokenError } from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import type { Deps } from "../deps";
import type { ChessGame } from "../games/chess/chess";
import type { ActionResponse } from "../games/chess/types";
import type { Game, GameKind } from "../games/game";
import type { Race2048 } from "../games/race2048/race";
import type { MoveResponse } from "../games/race2048/types";

/** What a request did to the game: its answer, and whether the game changed, so it's published */
type Outcome = { result: { ok: boolean }; changed: boolean };

type Act<G extends Game> = (play: G, userId: string, body: unknown) => Outcome;

async function act<G extends Game>(
    req: Request,
    res: Response,
    deps: Deps,
    kind: GameKind,
    action: Act<G>,
): Promise<void> {
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
        return;
    }
    const entry = deps.store.get(game);
    if (entry === undefined) {
        res.status(404).json({ ok: false, error: "This game is over" });
        return;
    }
    const { play } = entry;
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
