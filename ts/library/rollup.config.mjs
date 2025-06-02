import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default {
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
};
