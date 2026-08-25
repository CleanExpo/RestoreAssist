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
 * npm runs package scripts through `cmd.exe` on Windows (no shell
 * emulator is configured in this repo). `cmd.exe` does not parse a
 * leading `VAR=value` as an assignment -- it treats `CI` as a command
 * name, so the script died with
 *
 *   'CI' is not recognized as an internal or external command
 *
 * and exited 1 WITHOUT EVER LAUNCHING PLAYWRIGHT. Because
 * scripts/release-gate-score.ts scores B4-smoke-sandbox by shelling out to
 * `npm run test:smoke:sandbox`, so B4 scored `fail` on any Windows scoring
 * host for a reason that
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
import { assertMigrationHealthPayload } from "./ci/assert-migration-health.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const [baseUrl, ...extraArgs] = process.argv.slice(2);

if (!baseUrl) {
  console.error(
    "usage: node scripts/run-smoke.mjs <base-url> [extra playwright args...]",
  );
  process.exit(2);
}

const parsedBase = new URL(baseUrl);
if (
  parsedBase.pathname !== "/" ||
  parsedBase.search !== "" ||
  parsedBase.hash !== "" ||
  parsedBase.username !== "" ||
  parsedBase.password !== ""
) {
  console.error(`Smoke base URL must be an exact origin, observed ${baseUrl}`);
  process.exit(2);
}
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsedBase.hostname);
const isProduction = parsedBase.origin === "https://restoreassist.app";
const expectedSha = process.env.EXPECTED_DEPLOYMENT_SHA ?? process.env.GITHUB_SHA;
if (!isLocal && expectedSha) {
  let response;
  try {
    const healthUrl = new URL("/api/health", parsedBase);
    response = await fetch(healthUrl, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.url !== healthUrl.toString()) {
      console.error(
        `Deployment SHA preflight URL mismatch: expected ${healthUrl}, observed ${response.url}`,
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(`Deployment SHA preflight could not reach health endpoint: ${error}`);
    process.exit(1);
  }
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    console.error(`Deployment SHA preflight received HTTP ${response.status} or non-JSON health`);
    process.exit(1);
  }
  const health = await response.json();
  const observedSha = health?.deploymentSha;
  if (
    typeof observedSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(observedSha) ||
    observedSha.toLowerCase() !== expectedSha.toLowerCase()
  ) {
    console.error(
      `Deployment SHA preflight mismatch: expected ${expectedSha}, observed ${JSON.stringify(observedSha)}`,
    );
    process.exit(1);
  }
  console.log(`Deployment SHA preflight passed: ${observedSha}`);
}

if (isProduction) {
  const expectedFingerprint = process.env.EXPECTED_DATABASE_FINGERPRINT;
  let response;
  let payload;
  try {
    const migrationHealthUrl = new URL("/api/health/migrations", parsedBase);
    response = await fetch(migrationHealthUrl, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.url !== migrationHealthUrl.toString()) {
      throw new Error(
        `URL mismatch: expected ${migrationHealthUrl}, observed ${response.url}`,
      );
    }
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      throw new Error(`HTTP ${response.status} or non-JSON response`);
    }
    payload = await response.json();
    assertMigrationHealthPayload(
      payload,
      expectedFingerprint,
      process.env.EXPECTED_MIGRATION_COUNT,
      process.env.EXPECTED_MIGRATION_LEDGER_FINGERPRINT,
    );
  } catch (error) {
    console.error(`Migration-health preflight failed: ${error}`);
    process.exit(1);
  }
  console.log(
    `Migration-health preflight passed: ${payload.databaseFingerprint}`,
  );
}

let playwrightCli;
try {
  playwrightCli = require.resolve("@playwright/test/cli");
} catch {
  console.error(
    "Could not resolve @playwright/test/cli. Run `npm ci` first.",
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
