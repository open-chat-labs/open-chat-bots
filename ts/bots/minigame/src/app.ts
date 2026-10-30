// The bot's HTTP routes: its definition, the `/play` command, the MiniApp service's calls, the
// app's requests and the app itself.
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import path from "node:path";
import { definition } from "./definition";
import type { Deps } from "./deps";
import { chessDraw, chessMove, chessResign, raceMove, raceRestart } from "./handlers/api";
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
    app.post("/api/2048/move", express.json(), handle(raceMove));
    app.post("/api/2048/restart", express.json(), handle(raceRestart));
    app.post("/api/chess/move", express.json(), handle(chessMove));
    app.post("/api/chess/resign", express.json(), handle(chessResign));
    app.post("/api/chess/draw", express.json(), handle(chessDraw));

    // The app, which OpenChat opens in a frame. Its files are static and cacheable: the page is
    // the only thing spectators fetch from the bot.
    const index = path.resolve(appDir, "index.html");
    app.get(["/app", "/app/"], (_req, res) => {
        res.sendFile(index);
    });
    app.use("/app", express.static(path.resolve(appDir), { index: false, maxAge: "1h" }));

    return app;
}
