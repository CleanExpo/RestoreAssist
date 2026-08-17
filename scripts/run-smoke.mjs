#!/usr/bin/env node
/**
 * Cross-platform runner for the @smoke Playwright suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * `test:smoke:sandbox` and `test:smoke:prod` previously used a POSIX
 * env-var prefix:
 *
 *   CI=true PLAYWRIGHT_BASE_URL=https://... playwright test ...
 *
 * pnpm runs package scripts through `cmd.exe` on Windows (no shell
 * emulator is configured in this repo). `cmd.exe` does not parse a
 * leading `VAR=value` as an assignment -- it treats `CI` as a command
 * name, so the script died with
 *
 *   'CI' is not recognized as an internal or external command
 *
 * and exited 1 WITHOUT EVER LAUNCHING PLAYWRIGHT. Because
 * scripts/release-gate-score.ts scores A1-core-journeys and
 * B4-smoke-sandbox by shelling out to `pnpm test:smoke:sandbox`, both
 * criteria scored `fail` on any Windows scoring host for a reason that
 * had nothing to do with the sandbox deployment. See RA-5624.
 *
 * This wrapper sets the environment in-process and spawns the Playwright
 * CLI through `process.execPath`, so no shell is involved on any
 * platform and arguments containing spaces survive intact.
 *
 * Usage:
 *   node scripts/run-smoke.mjs <base-url> [extra playwright args...]
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const [baseUrl, ...extraArgs] = process.argv.slice(2);

if (!baseUrl) {
  console.error(
    "usage: node scripts/run-smoke.mjs <base-url> [extra playwright args...]",
  );
  process.exit(2);
}

let playwrightCli;
try {
  playwrightCli = require.resolve("@playwright/test/cli");
} catch {
  console.error(
    "Could not resolve @playwright/test/cli. Run `pnpm install` first.",
  );
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "-c",
    "config/playwright.config.ts",
    "--grep",
    "@smoke",
    "--reporter=line",
    ...extraArgs,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, CI: "true", PLAYWRIGHT_BASE_URL: baseUrl },
  },
);

if (result.error) {
  console.error(`Failed to launch Playwright: ${result.error.message}`);
  process.exit(1);
}

// A signal-terminated child reports status === null; treat that as failure
// rather than letting `?? 0` turn a SIGKILL into a green gate.
process.exit(result.status ?? 1);
