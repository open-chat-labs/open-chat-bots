// A player's moves, from the app, with their player token in `x-oc-jwt`. The bot applies the move
// and answers with the player's board straight away, so the app needn't wait for the state to come
// round through the service. The race's own player list is checked on every request: a player
// token outlives a removal by up to an hour.
import { MINI_APP_TOKEN_HEADER, TokenError } from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import type { Deps } from "../deps";
import type { Race2048 } from "../games/race2048/race";
import type { MoveResponse } from "../games/race2048/types";
import { RACE_SETTINGS } from "../games/race2048/settings";
import { parseSettings } from "../games/settings";

type Act = (race: Race2048, userId: string, body: unknown) => MoveResponse;

async function act(req: Request, res: Response, deps: Deps, action: Act): Promise<void> {
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
        res.status(404).json({ ok: false, error: "This game is over" } satisfies MoveResponse);
        return;
    }
    if (!entry.race.isPlayer(userId)) {
        res.status(403).json({ ok: false, error: "You aren't in this race" } satisfies MoveResponse);
        return;
    }
    // The time may have run out since the last sweep: then the race's end is what's published
    const endedNow = entry.race.endIfTimeUp();
    const result = action(entry.race, userId, req.body);
    if (endedNow || (result.ok && result.moved)) {
        deps.store.save();
        deps.publisher.publish(game);
    }
    if (!result.ok) {
        res.status(409).json(result);
        return;
    }
    res.json(result);
}

/** The host's change to the settings, from the lobby, published to everyone in it */
export async function settings(req: Request, res: Response, deps: Deps): Promise<void> {
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
    const parsed = parseSettings(RACE_SETTINGS, req.body);
    if (!parsed.ok) {
        res.status(400).json(parsed);
        return;
    }
    const result = entry.race.configure(userId, parsed.settings);
    if (!result.ok) {
        res.status(403).json(result);
        return;
    }
    deps.store.save();
    deps.publisher.publish(game);
    res.json({ ok: true, settings: entry.race.settings });
}

export function move(req: Request, res: Response, deps: Deps): Promise<void> {
    return act(req, res, deps, (race, userId, body) =>
        race.move(userId, (body as { direction?: unknown } | undefined)?.direction),
    );
}

export function restart(req: Request, res: Response, deps: Deps): Promise<void> {
    return act(req, res, deps, (race, userId) => race.restart(userId));
}
