// The routes anyone can fetch without a token: the bot's definition and the app's static files
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { definition } from "./definition";
import type { Deps } from "./deps";
import { GAMES } from "./games/registry";

// Vite copies this folder into `dist/app` as it is, so this is what the server serves under `/app`
const publicDir = path.resolve(__dirname, "app/public");

let base: string;
let close: () => void;

beforeAll(async () => {
    // None of these routes reach the handlers, so they need none of their dependencies
    const app = createApp({} as Deps, publicDir);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
});

afterAll(() => close());

describe("GET /bot_definition", () => {
    it("lists each game's app, with its image", async () => {
        const response = await fetch(`${base}/bot_definition`);
        expect(response.status).toBe(200);
        const json = (await response.json()) as typeof definition;
        expect(json.mini_apps).toEqual([{ name: "2048", image_url: "app/2048.svg" }]);
        expect(json.mini_apps).toHaveLength(GAMES.length);
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
