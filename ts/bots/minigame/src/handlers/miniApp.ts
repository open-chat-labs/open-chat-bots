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
    if (entry === undefined) {
        res.json({ accepted: false, message: "This game is over" } satisfies MiniAppJoinResponse);
        return;
    }
    const name = await deps.names.lookup(c.userId);
    const refusal = entry.play.join(c.userId, name);
    if (refusal !== undefined) {
        res.json({ accepted: false, message: refusal } satisfies MiniAppJoinResponse);
        return;
    }
    deps.store.save();
    // So everyone with the game open sees who's joined
    deps.publisher.publish(c.game);
    res.json({ accepted: true } satisfies MiniAppJoinResponse);
}

/**
 * Before the start, the user's seat is freed. After it, the game decides: a race goes on without
 * them, a chess game can't, so it ends.
 */
export async function leave(req: Request, res: Response, deps: Deps): Promise<void> {
    const c = await claims(req, res, deps, (t, h) => t.verifyLeave(h));
    if (c === undefined) return;
    const entry = deps.store.get(c.game);
    if (entry !== undefined && entry.play.leave(c.userId)) {
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
    const { play } = entry;
    if (play.phase === "open") {
        if (!play.isSeated(c.userId)) {
            res.json(refuseMiniAppStart("Join the game before starting it"));
            return;
        }
        const cannot = play.cannotStart();
        if (cannot !== undefined) {
            res.json(refuseMiniAppStart(cannot));
            return;
        }
    } else if (!play.isPlayer(c.userId)) {
        res.json(refuseMiniAppStart("You're not in this game"));
        return;
    }
    // Starting a game that has started, eg. as the first answer was lost, gives the players as
    // they are now. The first state goes in the answer, with a seq above any published before,
    // and whose turn it is, if the game has turns: White's, in chess. The flag falls through the
    // sweep, which looks at every game's clock each second.
    const players = play.start();
    deps.store.save();
    res.json(
        acceptMiniAppStart({
            players,
            waitingFor: play.waitingFor(),
            state: { seq: play.nextSeq(), shared: play.shared() },
        }),
    );
}
