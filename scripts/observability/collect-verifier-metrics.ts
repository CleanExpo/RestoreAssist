/**
 * collect-verifier-metrics.ts — read the verifier reports, append to a durable
 * ledger, and report the current band position.
 *
 *   npx tsx scripts/observability/collect-verifier-metrics.ts            # report only
 *   npx tsx scripts/observability/collect-verifier-metrics.ts --append   # also extend the ledger
 *   npx tsx scripts/observability/collect-verifier-metrics.ts --json
 *
 * WHY A LEDGER RATHER THAN JUST READING THE REPORTS. `.claude/verifier-reports/`
 * is in .gitignore. 151 files are tracked only because they predate that rule,
 * and no new report will ever be committed — so the signal is thrown away on
 * every fresh clone, and a CI job would see a frozen, months-old corpus. A
 * control band needs a series that grows.
 *
 * The ledger is therefore committed: one compact JSON line per verification, no
 * free text, no file paths, no claim bodies. Those live in the reports and can
 * contain absolute paths from a contributor's machine; the ledger carries only
 * what the bands are computed from.
 *
 * Appending is idempotent. Each line is keyed by session, timestamp and domain,
 * so re-running over the same reports adds nothing.
 */

import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  detect,
  parseReportFilename,
  summarise,
  type VerifierReport,
} from "./verifier-metrics";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const REPORTS_DIR = join(REPO_ROOT, ".claude", "verifier-reports");
const LEDGER = join(REPO_ROOT, "scripts", "observability", "verifier-ledger.jsonl");

function readReportsDir(): VerifierReport[] {
  if (!existsSync(REPORTS_DIR)) return [];
  const out: VerifierReport[] = [];
  for (const name of readdirSync(REPORTS_DIR)) {
    if (!name.endsWith(".json")) continue;
    const parts = parseReportFilename(name);
    if (!parts) continue;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(readFileSync(join(REPORTS_DIR, name), "utf8"));
    } catch {
      // A malformed report is not a clean one. Record it as unavailable so it
      // shows up in the metric rather than vanishing from the denominator.
      out.push({ ...parts, status: "verifier-error" });
      continue;
    }
    out.push({
      ...parts,
      status: String(body.status ?? "unknown"),
      claimsTotal: typeof body.claims_total === "number" ? body.claims_total : undefined,
      claimsFailed: typeof body.claims_failed === "number" ? body.claims_failed : undefined,
      claimsWarned: typeof body.claims_warned === "number" ? body.claims_warned : undefined,
    });
  }
  return out;
}

function readLedger(): VerifierReport[] {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as VerifierReport];
      } catch {
        return [];
      }
    });
}

function key(r: VerifierReport): string {
  return `${r.sessionId}:${r.timestamp}:${r.domain}`;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const fromDir = readReportsDir();
  const fromLedger = readLedger();

  const seen = new Set(fromLedger.map(key));
  const fresh = fromDir.filter((r) => !seen.has(key(r)));

  if (args.has("--append") && fresh.length > 0) {
    const lines = fresh
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((r) => JSON.stringify(r))
      .join("\n");
    appendFileSync(LEDGER, lines + "\n");
  }

  // The union, so a report is counted once whether it came from the ledger or
  // from a directory the ledger has not absorbed yet.
  const all = [...fromLedger, ...fresh];
  const summary = summarise(all);
  const detections = detect(summary);

  if (args.has("--json")) {
    console.log(JSON.stringify({ summary, detections, newlyAppended: args.has("--append") ? fresh.length : 0 }, null, 2));
    return;
  }

  console.log(`verifier metrics — ${summary.totalReports} verification(s)`);
  console.log(
    `  ${summary.populatedWindows} populated day(s) across ${summary.distinctSessions} session(s), ` +
      `spanning ${summary.spanDays} days`,
  );
  console.log(`  ${fresh.length} report(s) in the directory not yet in the ledger`);
  if (fresh.length > 0 && !args.has("--append")) {
    console.log("  (run with --append to absorb them; the reports directory is gitignored)");
  }
  console.log("");

  let worst = 0;
  for (const d of detections) {
    const rank = { ok: 0, log: 1, "insufficient-data": 1, diagnose: 2, propose: 3 }[d.tier];
    worst = Math.max(worst, rank);
    console.log(`  [${d.tier.toUpperCase()}] ${d.metric}`);
    console.log(`      ${d.reason}`);
  }

  console.log("");
  console.log(
    worst >= 2
      ? "RESULT: a band is breached — see scripts/observability/bands.yaml for what each tier authorises."
      : "RESULT: no band breached.",
  );

  // Never non-zero on a band breach. This reports a position; it is not a gate,
  // and turning an observability signal into a failing check is how people
  // learn to ignore it. `--strict` is deliberately absent.
}

main();
