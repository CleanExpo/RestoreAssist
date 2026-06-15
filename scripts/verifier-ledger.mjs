#!/usr/bin/env node
// verifier-ledger.mjs — Phase 3 of the verifier generalization plan
// (docs/verifier-generalization-plan.md).
//
// Rolls up the Stop-verifier's persisted reports (.claude/verifier-reports/*.json)
// into one aggregate view: blocks (status:"failed") by domain, and the count of
// claims that were left unverified. Turns the report trail from per-session
// noise into a longitudinal signal — the metric the plan promised.
//
// Usage:
//   node scripts/verifier-ledger.mjs            # all-time + last 7 days
//   node scripts/verifier-ledger.mjs --days 30  # custom recent window
//   node scripts/verifier-ledger.mjs --json     # machine-readable

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = join(REPO, ".claude", "verifier-reports");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const daysIdx = args.indexOf("--days");
const windowDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 7 : 7;

function loadReports() {
  let files;
  try {
    files = readdirSync(REPORTS_DIR);
  } catch {
    return null; // dir absent
  }
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    // Strip ".json", then the "-static" STAGE suffix, then split the remaining
    // "<session>-<ts>[-<domain>]". Pre-router reports had no <domain> segment
    // (just the original iOS verifier), so a missing domain == ios-app-review.
    let base = f.slice(0, -5);
    let stage = "llm";
    if (base.endsWith("-static")) {
      stage = "static";
      base = base.slice(0, -7);
    }
    const m = base.match(/^.*-(\d{10,})(?:-(.+))?$/);
    if (!m) continue;
    const ts = m[1];
    const domain = m[2] || "ios-app-review";
    let body = {};
    try {
      body = JSON.parse(readFileSync(join(REPORTS_DIR, f), "utf8"));
    } catch {
      body = { status: "unparseable" };
    }
    out.push({
      domain,
      stage,
      tsMs: Number(ts) * 1000,
      status: body.status ?? "unknown",
      claimsFailed: Number(body.claims_failed) || 0,
      claimsUnverified: Number(body.claims_unverified) || 0,
    });
  }
  return out;
}

function summarize(reports) {
  const byDomain = {};
  let blocks = 0;
  let unverified = 0;
  for (const r of reports) {
    const d = (byDomain[r.domain] ??= {
      reports: 0,
      blocks: 0,
      partial: 0,
      clean: 0,
      unavailable: 0,
      claimsUnverified: 0,
    });
    d.reports++;
    d.claimsUnverified += r.claimsUnverified;
    unverified += r.claimsUnverified;
    if (r.status === "failed") {
      d.blocks++;
      blocks++;
    } else if (r.status === "partial") d.partial++;
    else if (r.status === "verifier-unavailable") d.unavailable++;
    else d.clean++; // verified / static-clean / other pass states
  }
  return { total: reports.length, blocks, unverified, byDomain };
}

const all = loadReports();
if (all === null) {
  console.log(
    `No verifier-reports directory yet (${REPORTS_DIR}). Run some edits through the Stop verifier first.`,
  );
  process.exit(0);
}

const cutoff = Date.now() - windowDays * 86400_000;
const recent = all.filter((r) => r.tsMs >= cutoff);
const allSummary = summarize(all);
const recentSummary = summarize(recent);

if (asJson) {
  console.log(
    JSON.stringify(
      { windowDays, allTime: allSummary, recent: recentSummary },
      null,
      2,
    ),
  );
  process.exit(0);
}

const fmtDomain = (s) => {
  const rows = Object.entries(s.byDomain).sort(
    (a, b) => b[1].blocks - a[1].blocks,
  );
  if (rows.length === 0) return "  (no reports)";
  return rows
    .map(
      ([name, d]) =>
        `  ${name.padEnd(20)} reports ${String(d.reports).padStart(4)} | blocks ${String(d.blocks).padStart(3)} | partial ${String(d.partial).padStart(3)} | unavail ${String(d.unavailable).padStart(3)} | claims-unverified ${d.claimsUnverified}`,
    )
    .join("\n");
};

console.log("VERIFIER LEDGER");
console.log("===============");
console.log(`reports dir: ${REPORTS_DIR}`);
console.log("");
console.log(
  `ALL TIME — ${allSummary.total} reports, ${allSummary.blocks} blocks, ${allSummary.unverified} claims left unverified`,
);
console.log(fmtDomain(allSummary));
console.log("");
console.log(
  `LAST ${windowDays} DAYS — ${recentSummary.total} reports, ${recentSummary.blocks} blocks, ${recentSummary.unverified} claims left unverified`,
);
console.log(fmtDomain(recentSummary));
