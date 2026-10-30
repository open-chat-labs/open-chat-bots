// Builds the browser app OpenChat opens from a game's card, at `<endpoint>/app`, into `dist/app`.
// The server serves that folder as static files. The game engine under `src/games` is shared with
// the server, so the app can apply a move before the server confirms it.
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: "src/app",
    base: "/app/",
    build: {
        outDir: "../../dist/app",
        emptyOutDir: true,
        target: "es2022",
        sourcemap: true,
    },
    // The tests are the engine's and the race's, under `src/games`, not the app's
    test: {
        root: ".",
        include: ["src/**/*.spec.ts"],
    },
});
