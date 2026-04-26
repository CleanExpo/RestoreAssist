/**
 * CLI entrypoint.
 *
 *   pnpm --filter pilot-tester run -- --base-url <url> [--company <key>] [--job <key>]
 *   pnpm --filter pilot-tester swarm -- --base-url <url> [--concurrency 3]
 *
 * Reads .env, asserts sandbox, calls the orchestrator, writes the report.
 */

import "dotenv/config";
import { loadUserPool } from "./client/auth.js";
import { runHarness } from "./runner/orchestrator.js";
import { writeReport } from "./runner/reporter.js";

interface CliArgs {
  command: "run" | "swarm";
  baseUrl: string;
  companyKey?: string;
  jobKey?: string;
  concurrency: number;
  userPoolPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const command = argv[2] === "swarm" ? "swarm" : "run";
  const args: Record<string, string> = {};
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = value;
      if (value !== "true") i++;
    }
  }

  const baseUrl =
    args["base-url"] ?? process.env.PILOT_TESTER_BASE_URL ?? "";
  const userPoolPath =
    args["user-pool"] ?? process.env.PILOT_TESTER_USER_POOL ?? "./user-pool.json";

  if (!baseUrl) {
    throw new Error(
      "[pilot-tester] --base-url or PILOT_TESTER_BASE_URL is required",
    );
  }

  return {
    command,
    baseUrl,
    companyKey: args["company"],
    jobKey: args["job"],
    concurrency: parseInt(args["concurrency"] ?? "3", 10),
    userPoolPath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const userPool = await loadUserPool(args.userPoolPath);
  const report = await runHarness({
    baseUrl: args.baseUrl,
    databaseUrl: process.env.PILOT_TESTER_DATABASE_URL,
    userPool,
    companyKey: args.command === "run" ? args.companyKey : undefined,
    jobKey: args.command === "run" ? args.jobKey : undefined,
    concurrency: args.concurrency,
  });

  const written = await writeReport(report);
  // eslint-disable-next-line no-console
  console.log(
    `\n[pilot-tester] wrote ${written.markdownPath}\n[pilot-tester] success=${report.success}`,
  );

  process.exit(report.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
