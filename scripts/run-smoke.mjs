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
 *
 * `--allow-stale` downgrades a STALE verdict to a warning and continues to the
 * flows: a build that is not this revision still has to be up.
 *
 * `--flows-despite-degraded` runs the flows even when the migration-health
 * probe fails, to establish whether users are affected. It does NOT make that
 * failure green -- the run still exits 1 afterwards, whatever the flows say.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertMigrationHealthPayload } from "./ci/assert-migration-health.mjs";
import {
  classifyDeploymentFreshness,
  FRESH,
  STALE,
} from "./ci/classify-deployment-freshness.mjs";
import { finalSmokeExitCode, parseSmokeArgs } from "./ci/smoke-args.mjs";
import {
  assessSkips,
  smokeCoverageExitCode,
} from "./ci/smoke-skip-policy.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const [baseUrl, ...rawArgs] = process.argv.slice(2);
const { preflightOnly, allowStale, flowsDespiteDegraded, extraArgs } =
  parseSmokeArgs(rawArgs);

/** Set to the migration-health error when the run continues past it. */
let degradedPreflight = null;

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

    // `--allow-stale` is how the outage watch says "I already know it is
    // stale; the freshness step reported that. Tell me whether the site is
    // UP." Without it the flows were skipped on every stale run, so for as
    // long as a release sat unpromoted the watch proved nothing at all — and
    // a genuine outage during that window would have produced the same exit 3
    // everyone had stopped reading.
    if (allowStale) {
      reportToStepSummary(
        "🟡 Production is stale — checking availability anyway",
        `${reason}\n\nThe application answered \`/api/health\` normally. The user ` +
          `flows below run against the **deployed** build, so a pass means the site ` +
          `is up; it does not mean this revision works.\n\n` +
          `**Fix:** promote a release.`,
      );
      console.error(
        "Continuing to the user flows anyway (--allow-stale): a stale build " +
          "still has to be up. A failure below is an availability failure.",
      );
    } else {
      reportToStepSummary(
        "🟡 Production is stale, not broken",
        `${reason}\n\nThe application answered \`/api/health\` normally. This run did not ` +
          `test user flows, because testing them against a revision that is not this ` +
          `one would not tell you anything about this revision.\n\n` +
          `**Fix:** promote a release. **Do not** debug the app for this.`,
      );
      process.exit(3);
    }
  }

  // STALE is excluded explicitly: reaching here as STALE means `--allow-stale`
  // was passed and the branch above deliberately fell through. Without this,
  // a tolerated stale run would exit 1 and report an outage — collapsing the
  // very distinction between "not deployed" and "down" that the separate exit
  // codes exist to preserve.
  if (verdict !== FRESH && verdict !== STALE) {
    const detail = fetchError ? `${reason}: ${fetchError}` : reason;
    console.error(`Deployment freshness preflight failed: ${detail}`);
    reportToStepSummary(
      "🔴 Production did not answer",
      `${detail}\n\nThis is an availability failure, not a stale deploy.`,
    );
    process.exit(1);
  }

  if (verdict === FRESH) {
    console.log(`Deployment freshness preflight passed: ${reason}`);
  }
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

    // Aborting here answers "is the database path healthy?" and throws away
    // "are users affected?", which is the more urgent of the two during an
    // incident. `/api/health/migrations` returned 504 twice in ten minutes on
    // 2026-08-30 and the flows never ran, so nobody could say whether sign-in
    // still worked.
    //
    // This does NOT forgive the failure. The exit is deferred, not cancelled:
    // the run still ends non-zero below, whatever the flows say. A degraded
    // preflight that scored green would be the same defect as the staleness
    // abort, pointed the other way.
    if (!flowsDespiteDegraded) {
      process.exit(1);
    }
    degradedPreflight = String(error);
    reportToStepSummary(
      "🔴 Migration health is failing — running the flows anyway",
      `${degradedPreflight}\n\nThe user flows below ran despite this, to establish ` +
        `whether customers are affected. **This run fails regardless of their result.**`,
    );
    console.error(
      "Running the user flows anyway (--flows-despite-degraded) to find out " +
        "whether users are affected. This run will still fail.",
    );
  }
  if (!degradedPreflight) {
    console.log(
      `Migration-health preflight passed: ${payload.databaseFingerprint}`,
    );
  }
}

if (preflightOnly) {
  if (degradedPreflight) {
    console.error("Preflight only: migration health is failing.");
    process.exit(1);
  }
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

// A machine-readable report alongside the human one. Without it the only
// signal about the run is Playwright's exit status, and that status is 0 when
// every test SKIPPED -- see scripts/ci/smoke-skip-policy.mjs.
const reportDir = mkdtempSync(path.join(tmpdir(), "ra-smoke-"));
const reportPath = path.join(reportDir, "report.json");

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "-c",
    "config/playwright.config.ts",
    "--grep",
    "@smoke",
    "--reporter=line,json",
    ...extraArgs,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "true",
      PLAYWRIGHT_BASE_URL: baseUrl,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    },
  },
);

if (result.error) {
  console.error(`Failed to launch Playwright: ${result.error.message}`);
  process.exit(1);
}

// A signal-terminated child reports status === null; treat that as failure
// rather than letting `?? 0` turn a SIGKILL into a green gate.
const flowStatus = result.status ?? 1;

// COVERAGE. Playwright exits 0 when tests are skipped, so the status above
// cannot distinguish "the flows passed" from "the flows never ran". Observed
// against production 2026-09-06: 3 skipped, and those three were the only
// specs that would have touched an authenticated surface. A skip is allowed
// only if it is declared with a reason.
let coverageExit = flowStatus;
try {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/ci/smoke-skip-manifest.json"), "utf8"),
  );
  const declared = (isProduction ? manifest.production : manifest.default) ?? {};
  const assessment = assessSkips(report, declared);

  for (const s of assessment.declared) {
    console.warn(
      `NOT COVERED BY THIS RUN: "${s.title}"\n  ${s.reason}`,
    );
  }
  for (const s of assessment.undeclared) {
    console.error(
      `UNDECLARED SKIP: "${s.title}" (${s.file}) did not run, and nothing says why. ` +
        "A skipped flow is not a passed flow -- declare it in " +
        "scripts/ci/smoke-skip-manifest.json with a reason, or make it run.",
    );
  }
  for (const title of assessment.staleDeclarations) {
    console.error(
      `STALE SKIP DECLARATION: "${title}" is exempted in ` +
        "scripts/ci/smoke-skip-manifest.json but did not skip. Remove the " +
        "exemption -- a stale one is how a suite quietly stops being run.",
    );
  }
  if (assessment.declared.length) {
    console.warn(
      `This run left ${assessment.declared.length} declared flow(s) unproven. ` +
        "It is not a statement that they work.",
    );
  }

  coverageExit = smokeCoverageExitCode({
    flowStatus,
    undeclaredCount: assessment.undeclared.length,
    staleCount: assessment.staleDeclarations.length,
  });
} catch (error) {
  // Coverage we cannot read is coverage we cannot claim. Exit 2 is this
  // script's established "could not run", which is never a pass.
  console.error(`Smoke coverage could not be assessed: ${error}`);
  rmSync(reportDir, { recursive: true, force: true });
  process.exit(2);
}
rmSync(reportDir, { recursive: true, force: true });

// The deferred exit -- see finalSmokeExitCode, where the rule is unit-tested.
if (degradedPreflight) {
  console.error(
    flowStatus === 0
      ? "User flows PASSED, but migration health is failing: users are not " +
          "visibly affected yet and production is still degraded."
      : "User flows FAILED and migration health is failing: users are affected.",
  );
}

process.exit(
  finalSmokeExitCode({
    degraded: Boolean(degradedPreflight),
    flowStatus: coverageExit,
  }),
);
