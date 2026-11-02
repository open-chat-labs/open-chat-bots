// The bot's HTTP routes: its definition, the `/play` command, the MiniApp service's calls, the
// app's requests and the app itself.
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import path from "node:path";
import { definition } from "./definition";
import type { Deps } from "./deps";
import { DUELS } from "./games/registry";
import {
    chatmanTurn,
    chessDraw,
    chessMove,
    chessResign,
    duelMove,
    duelResign,
    mazeMove,
    raceMove,
    raceRestart,
    settings,
    userNames,
} from "./handlers/api";
import { join, leave, start } from "./handlers/miniApp";
import { executeCommand } from "./handlers/play";

type Handler = (req: Request, res: Response, deps: Deps) => Promise<void>;

export function createApp(deps: Deps, appDir: string): Express {
    const app = express();
    const handle = (handler: Handler) => (req: Request, res: Response) => {
        handler(req, res, deps).catch((err) => {
            console.error(`${req.method} ${req.path} failed:`, err);
            if (!res.headersSent) res.status(500).json({ error: "Something went wrong" });
        });
    };

    app.use(cors());
    app.get(["/", "/bot_definition"], (_req, res) => {
        res.json(definition);
    });
    app.post("/execute_command", express.text({ type: "*/*" }), handle(executeCommand));

    // The MiniApp service, with its token in a header and no body
    app.post("/mini_app/join", handle(join));
    app.post("/mini_app/leave", handle(leave));
    app.post("/mini_app/start", handle(start));

    // Players' apps, with a player token in a header
    app.post("/api/settings", express.json(), handle(settings));
    app.post("/api/2048/move", express.json(), handle(raceMove));
    app.post("/api/2048/restart", express.json(), handle(raceRestart));
    app.post("/api/chess/move", express.json(), handle(chessMove));
    app.post("/api/chess/resign", express.json(), handle(chessResign));
    app.post("/api/chess/draw", express.json(), handle(chessDraw));
    // The duels' alike, but for what a move is
    for (const kind of DUELS) {
        app.post(`/api/${kind}/move`, express.json(), handle(duelMove(kind)));
        app.post(`/api/${kind}/resign`, express.json(), handle(duelResign(kind)));
    }

    // A racer's move in a maze race while their socket's not open; it's usually live (`live.ts`)
    app.post("/api/maze/move", express.json(), handle(mazeMove));
    // A ChatMan player's turn, likewise
    app.post("/api/chatman/turn", express.json(), handle(chatmanTurn));

    // Anyone with a game open, watching included, and anyone opening a finished card: no token
    app.get("/api/names", handle(userNames));

    // The app, which OpenChat opens in a frame, and frames afresh each time its card is back on
    // screen: its files are the only thing spectators fetch from the bot, so they're cached.
    // Vite names the page's bundles by their content, so a release's are new files, which
    // browsers and CloudFront keep for good. The page, which names them, only the browser keeps,
    // for a minute, along with the bundles it fetched for it. CloudFront asks the bot for it each
    // time, as a page it kept from before a release would name bundles the bot no longer has, and
    // the page's Reload button, for a newer page, would get it back. The rest, eg. the cards'
    // artwork, for an hour.
    const index = path.resolve(appDir, "index.html");
    app.get(["/app", "/app/", "/app/index.html"], (_req, res) => {
        // Only on the page: an error, eg. no page in a broken build, isn't kept
        res.sendFile(index, { headers: { "Cache-Control": "private, max-age=60" } });
    });
    app.use(
        "/app/assets",
        express.static(path.resolve(appDir, "assets"), {
            index: false,
            immutable: true,
            maxAge: "1y",
        }),
    );
    app.use("/app", express.static(path.resolve(appDir), { index: false, maxAge: "1h" }));

    return app;
}
