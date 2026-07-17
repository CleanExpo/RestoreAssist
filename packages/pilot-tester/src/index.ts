/**
 * CLI entrypoint.
 *
 *   pnpm --filter pilot-tester run    -- --base-url <url> [--company <key>] [--job <key>]
 *   pnpm --filter pilot-tester swarm  -- --base-url <url> [--concurrency 3]
 *   pnpm --filter pilot-tester dryrun                   (self-test, no network)
 *
 * Reads .env, asserts sandbox, calls the orchestrator, writes the
 * report, and runs baseline regression analysis. Exits non-zero on
 * either an orchestrator failure or a baseline regression.
 */

import "dotenv/config";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadUserPool } from "./client/auth.js";
import { runHarness } from "./runner/orchestrator.js";
import { writeReport } from "./runner/reporter.js";
import { analyseRegression } from "./runner/baseline.js";
import { dryRun } from "./runner/dry-run.js";

interface CliArgs {
  command: "run" | "swarm" | "dryrun";
  baseUrl?: string;
  companyKey?: string;
  jobKey?: string;
  concurrency: number;
  userPoolPath: string;
  baselinePath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const command =
    argv[2] === "swarm" ? "swarm" : argv[2] === "dryrun" ? "dryrun" : "run";
  const args: Record<string, string> = {};
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = value;
      if (value !== "true") i++;
    }
  }

  const baseUrl =
    args["base-url"] ?? process.env.PILOT_TESTER_BASE_URL ?? undefined;
  const userPoolPath =
    args["user-pool"] ??
    process.env.PILOT_TESTER_USER_POOL ??
    "./user-pool.json";
  const baselinePath =
    args["baseline"] ??
    process.env.PILOT_TESTER_BASELINE ??
    path.resolve(process.cwd(), "baselines/sandbox.json");

  if (command !== "dryrun" && !baseUrl) {
    throw new Error(
      "[pilot-tester] --base-url or PILOT_TESTER_BASE_URL is required for run/swarm",
    );
  }

  return {
    command,
    baseUrl,
    companyKey: args["company"],
    jobKey: args["job"],
    concurrency: parseInt(args["concurrency"] ?? "3", 10),
    userPoolPath,
    baselinePath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === "dryrun") {
    const ok = await dryRun();
    process.exit(ok ? 0 : 1);
  }

  // Best-effort user-pool load. If missing in CI, surface clearly
  // rather than crashing in fetch.
  let userPool;
  try {
    userPool = await loadUserPool(args.userPoolPath);
  } catch (err) {
    console.error(
      `[pilot-tester] could not load user pool from ${args.userPoolPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      `[pilot-tester] tip: copy user-pool.example.json → user-pool.json and provision sandbox accounts.`,
    );
    process.exit(2);
  }

  const report = await runHarness({
    baseUrl: args.baseUrl as string,
    databaseUrl: process.env.PILOT_TESTER_DATABASE_URL,
    userPool,
    companyKey: args.command === "run" ? args.companyKey : undefined,
    jobKey: args.command === "run" ? args.jobKey : undefined,
    concurrency: args.concurrency,
  });

  // Best-effort regression analysis — if the baseline file is
  // missing, the analysis returns baselineFound=false and the
  // reporter calls it out without failing the run.
  const regression = await analyseRegression({
    report,
    baselinePath: args.baselinePath,
  });

  const written = await writeReport(report, regression);
  // eslint-disable-next-line no-console
  console.log(
    `\n[pilot-tester] wrote ${written.markdownPath}\n[pilot-tester] success=${report.success} regression=${regression.pass ? "pass" : "fail"}`,
  );

  // Exit non-zero on either orchestrator failure or hard regression.
  process.exit(report.success && regression.pass ? 0 : 1);
}

// Avoid unused-import lint warning on `fs` — used by dryRun module
// (kept here for symmetric path resolution if dryRun needs to read
// files from the workspace root).
void fs;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
