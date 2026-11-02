// The routes anyone can fetch without a token: the bot's definition, the app's static files and
// users' usernames
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { TokenError, validateMiniAppAppName } from "@open-ic/openchat-botclient-ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { definition } from "./definition";
import type { Deps } from "./deps";
import { DUELS, GAMES } from "./games/registry";

// Vite copies this folder into `dist/app` as it is, so this is what the server serves under `/app`
const publicDir = path.resolve(__dirname, "app/public");

let base: string;
let close: () => void;

beforeAll(async () => {
    // Of the handlers' dependencies, these routes only reach the names
    const names = { username: async (id: string) => (id === "abc" ? "abc-name" : undefined) };
    // and a player's token, which is never good here: a route that's there answers 401
    const tokens = async () => ({
        verifyPlayer: () => {
            throw new TokenError("invalid", "Not a token");
        },
    });
    const app = createApp({ names, tokens } as unknown as Deps, publicDir);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
});

afterAll(() => close());

describe("GET /api/names", () => {
    it("gives usernames by id, for a request with no token", async () => {
        const response = await fetch(`${base}/api/names?ids=abc,nobody`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ names: { abc: "abc-name" } });
    });

    it("refuses a request with no ids", async () => {
        expect((await fetch(`${base}/api/names`)).status).toBe(400);
    });
});

describe("a duel's requests", () => {
    it("are routed for each duel", async () => {
        for (const kind of DUELS) {
            for (const action of ["move", "resign"]) {
                const response = await fetch(`${base}/api/${kind}/${action}`, { method: "POST" });
                expect(response.status, `/api/${kind}/${action}`).toBe(401);
            }
        }
    });
});

describe("GET /bot_definition", () => {
    it("lists each game's app, with its image", async () => {
        const response = await fetch(`${base}/bot_definition`);
        expect(response.status).toBe(200);
        const json = (await response.json()) as typeof definition;
        expect(json.mini_apps).toEqual([
            { name: "2048", image_url: "app/2048.svg" },
            { name: "chess", image_url: "app/chess.svg" },
            { name: "four-in-a-row", image_url: "app/four-in-a-row.svg" },
            { name: "reversi", image_url: "app/reversi.svg" },
            { name: "maze", image_url: "app/maze.svg" },
            { name: "chatman", image_url: "app/chatman.svg" },
            { name: "minesweeper", image_url: "app/minesweeper.svg" },
        ]);
        expect(json.mini_apps).toHaveLength(GAMES.length);
        // Each named as OpenChat takes an app's name
        for (const app of json.mini_apps ?? []) {
            expect(validateMiniAppAppName(app.name)).toBeUndefined();
        }
        expect(json.description).toContain("chess");
        // Every game is a choice of `/play`
        expect(json.commands[0].params[0].param_type.StringParam.choices).toEqual([
            { name: "2048 Race", value: "2048" },
            { name: "Chess", value: "chess" },
            { name: "Four in a Row", value: "four-in-a-row" },
            { name: "Reversi", value: "reversi" },
            { name: "Maze Race", value: "maze" },
            { name: "ChatMan", value: "chatman" },
            { name: "Minesweeper Race", value: "minesweeper" },
        ]);
        // And the only parameter: the settings are the host's, in the lobby
        expect(json.commands[0].params).toHaveLength(1);
    });

    it("has each image where the server serves it from", () => {
        for (const game of GAMES) {
            expect(game.image.startsWith("app/")).toBe(true);
            const file = path.join(publicDir, game.image.slice("app/".length));
            expect(fs.existsSync(file), `${game.image} isn't in src/app/public`).toBe(true);
        }
    });
});

describe("GET /app/2048.svg", () => {
    it("serves the image as SVG, cacheable", async () => {
        const response = await fetch(`${base}/app/2048.svg`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
        expect(response.headers.get("cache-control")).toContain("max-age=3600");
        const body = await response.text();
        expect(body).toMatch(/^<svg\b/);
        expect(body).toContain('viewBox="0 0 480 720"');
        expect(body).toContain("2048 Race");
        // Nothing fetched from elsewhere
        expect(body).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
        expect(body).not.toContain("<script");
    });
});

describe("GET /app/chess.svg", () => {
    it("serves the image as SVG, at the app's aspect ratio", async () => {
        const response = await fetch(`${base}/app/chess.svg`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
        expect(response.headers.get("cache-control")).toContain("max-age=3600");
        const body = await response.text();
        expect(body).toMatch(/^<svg\b/);
        expect(body).toContain('viewBox="0 0 440 740"');
        expect(body).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
        expect(body).not.toContain("<script");
    });
});
