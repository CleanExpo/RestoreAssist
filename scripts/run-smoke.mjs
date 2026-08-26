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
 *   node scripts/run-smoke.mjs <base-url> [--preflight-only] [playwright args...]
 *
 * EXIT CODES
 * ----------
 * Callers (and the workflow) distinguish these, so do not collapse them:
 *
 *   0  everything asked for passed
 *   1  production is broken: unreachable, migration parity failed, or a
 *      @smoke user flow failed
 *   2  usage or local setup error (bad base URL, Playwright not installed)
 *   3  production is HEALTHY but STALE -- it is not serving this revision.
 *      Nothing is broken; the release was never promoted. Kept distinct from
 *      1 so an un-deployed backlog cannot masquerade as an outage, and so a
 *      real outage during such a backlog is still visible.
 *
 * `--preflight-only` stops after the freshness and migration probes without
 * running Playwright, so a workflow can report "is production current?"
 * as its own named step, separately from "do the user flows work?".
 */

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertMigrationHealthPayload } from "./ci/assert-migration-health.mjs";
import {
  classifyDeploymentFreshness,
  FRESH,
  STALE,
} from "./ci/classify-deployment-freshness.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const [baseUrl, ...rawArgs] = process.argv.slice(2);
const preflightOnly = rawArgs.includes("--preflight-only");
const extraArgs = rawArgs.filter((arg) => arg !== "--preflight-only");

/**
 * State the verdict where the run page shows it without opening logs. Silent
 * when not on Actions, and never fatal -- a summary that cannot be written
 * must not change the gate's outcome.
 */
function reportToStepSummary(heading, detail) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  try {
    appendFileSync(target, `### ${heading}\n\n${detail}\n\n`);
  } catch {
    /* a missing summary file is not a smoke result */
  }
}

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
const expectedSha =
  process.env.EXPECTED_DEPLOYMENT_SHA ?? process.env.GITHUB_SHA;
if (!isLocal && expectedSha) {
  const healthUrl = new URL("/api/health", parsedBase).toString();
  let fetchError;
  const probe = {
    expectedSha,
    reached: false,
    requestedUrl: healthUrl,
    finalUrl: undefined,
    status: undefined,
    contentType: undefined,
    body: undefined,
  };

  try {
    const response = await fetch(healthUrl, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    probe.reached = true;
    probe.finalUrl = response.url;
    probe.status = response.status;
    probe.contentType = response.headers.get("content-type") ?? undefined;
    // Only a 200 JSON response is worth parsing; a parse failure here is
    // itself evidence production is not answering properly, so it stays
    // inside the probe rather than throwing past the classifier.
    try {
      probe.body = await response.json();
    } catch {
      probe.body = undefined;
    }
  } catch (error) {
    // Keep the transport error: for a genuine outage, whether this was DNS,
    // TLS, or a timeout is the most useful line in the log.
    fetchError = error;
  }

  const { verdict, reason } = classifyDeploymentFreshness(probe);

  if (verdict === STALE) {
    console.error(`Production is STALE, not broken: ${reason}`);
    console.error(
      "Nothing here says the application is unhealthy. main has moved ahead " +
        "of what is deployed; promote a release rather than debugging the app.",
    );
    reportToStepSummary(
      "🟡 Production is stale, not broken",
      `${reason}\n\nThe application answered \`/api/health\` normally. This run did not ` +
        `test user flows, because testing them against a revision that is not this ` +
        `one would not tell you anything about this revision.\n\n` +
        `**Fix:** promote a release. **Do not** debug the app for this.`,
    );
    process.exit(3);
  }

  if (verdict !== FRESH) {
    const detail = fetchError ? `${reason}: ${fetchError}` : reason;
    console.error(`Deployment freshness preflight failed: ${detail}`);
    reportToStepSummary(
      "🔴 Production did not answer",
      `${detail}\n\nThis is an availability failure, not a stale deploy.`,
    );
    process.exit(1);
  }

  console.log(`Deployment freshness preflight passed: ${reason}`);
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

if (preflightOnly) {
  console.log("Preflight only: production is current. Not running Playwright.");
  process.exit(0);
}

let playwrightCli;
try {
  playwrightCli = require.resolve("@playwright/test/cli");
} catch {
  console.error("Could not resolve @playwright/test/cli. Run `npm ci` first.");
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
