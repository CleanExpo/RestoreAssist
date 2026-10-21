// JEV deterministic families (tests/eval/jev). Same aliases and DB guard as
// the unit config; collects only *.jev.test.ts so the unit job never runs them.
import { resolve } from "path";
import { fileURLToPath } from "url";
import base from "./vitest.config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

export default {
  ...base,
  test: {
    ...base.test,
    environmentMatchGlobs: [],
    setupFiles: [...base.test.setupFiles, resolve(repoRoot, "tests/eval/jev/runner/setup.ts")],
    include: [process.env.JEV_INCLUDE || "tests/eval/jev/families/**/*.jev.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
};
