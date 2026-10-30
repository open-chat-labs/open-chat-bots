// The MiniApp service's calls: someone asks to join a game, a player asks to start it, or someone
// leaves. Each comes with the service's token in `x-oc-jwt`, and must be answered within 5
// seconds. Nothing here waits on a publish: the service holds a game while it asks to start it.
import {
    MINI_APP_TOKEN_HEADER,
    TokenError,
    acceptMiniAppStart,
    refuseMiniAppStart,
    type MiniAppJoinResponse,
    type MiniAppPlayerClaims,
    type MiniAppTokens,
} from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import type { Deps } from "../deps";
import { MAX_PLAYERS } from "../games/race2048/types";

type Verify = (tokens: MiniAppTokens, header: string | string[] | undefined) => MiniAppPlayerClaims;

/** The token's claims, or undefined after answering a 401 */
async function claims(
    req: Request,
    res: Response,
    deps: Deps,
    verify: Verify,
): Promise<MiniAppPlayerClaims | undefined> {
    try {
        return verify(await deps.tokens(), req.headers[MINI_APP_TOKEN_HEADER]);
    } catch (err) {
        if (err instanceof TokenError) {
            res.status(401).json({ error: err.message });
        } else {
            console.error("Couldn't verify the token:", err);
            res.status(500).json({ error: "Couldn't verify the token" });
        }
        return undefined;
    }
}

export async function join(req: Request, res: Response, deps: Deps): Promise<void> {
    const c = await claims(req, res, deps, (t, h) => t.verifyJoin(h));
    if (c === undefined) return;
    const entry = deps.store.get(c.game);
    const refuse = (message: string): MiniAppJoinResponse => ({ accepted: false, message });
    if (entry === undefined) {
        res.json(refuse("This game is over"));
        return;
    }
    const name = await deps.names.lookup(c.userId);
    switch (entry.race.takeSeat(c.userId, name)) {
        case "seated":
        case "already_seated":
            deps.store.save();
            deps.publisher.publish(c.game);
            res.json({ accepted: true } satisfies MiniAppJoinResponse);
            return;
        case "full":
            res.json(refuse(`All ${MAX_PLAYERS} seats are taken`));
            return;
        case "started":
            res.json(refuse("The race has already started"));
            return;
    }
}

export async function leave(req: Request, res: Response, deps: Deps): Promise<void> {
    const c = await claims(req, res, deps, (t, h) => t.verifyLeave(h));
    if (c === undefined) return;
    const entry = deps.store.get(c.game);
    if (entry !== undefined && entry.race.leaveSeat(c.userId)) {
        deps.store.save();
        deps.publisher.publish(c.game);
    }
    // 200 whether or not they had a seat
    res.json({});
}

export async function start(req: Request, res: Response, deps: Deps): Promise<void> {
    const c = await claims(req, res, deps, (t, h) => t.verifyStart(h));
    if (c === undefined) return;
    const entry = deps.store.get(c.game);
    if (entry === undefined) {
        res.json(refuseMiniAppStart("This game is over"));
        return;
    }
    const { race } = entry;
    if (race.phase === "open") {
        if (!race.isSeated(c.userId)) {
            res.json(refuseMiniAppStart("Join the race before starting it"));
            return;
        }
        const cannot = race.cannotStart();
        if (cannot !== undefined) {
            res.json(refuseMiniAppStart(cannot));
            return;
        }
    }
    // Starting a race that has started, eg. as the first answer was lost, gives the players as
    // they are now. The first state goes in the answer, with a seq above any published before.
    const players = race.start();
    deps.store.save();
    res.json(
        acceptMiniAppStart({
            players,
            // A race: it's everyone's turn at once
            waitingFor: [],
            state: { seq: race.nextSeq(), shared: race.shared() },
        }),
    );
}
