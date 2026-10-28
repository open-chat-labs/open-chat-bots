import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default [
    {
        input: "src/index.ts", // Entry point for your library
        output: [
            {
                file: "lib/index.cjs", // CommonJS output
                format: "cjs",
                sourcemap: true,
            },
            {
                file: "lib/index.mjs", // ES module output
                format: "es",
                sourcemap: true,
            },
        ],
        plugins: [
            resolve(), // Resolves third-party modules in node_modules
            commonjs(), // Converts CommonJS to ES modules for Rollup
            typescript({ tsconfig: "./tsconfig.json" }), // Handles TypeScript compilation
        ],
    },
    // `@open-ic/openchat-botclient-ts/mini_app`, for the app a bot opens from its MiniApp card. It
    // runs in the browser, so it's built on its own, without the Node dependencies above.
    {
        input: "src/mini_app/index.ts",
        output: [
            {
                file: "lib/mini_app.cjs",
                format: "cjs",
                sourcemap: true,
            },
            {
                file: "lib/mini_app.mjs",
                format: "es",
                sourcemap: true,
            },
        ],
        plugins: [typescript({ tsconfig: "./tsconfig.json" })],
    },
];
