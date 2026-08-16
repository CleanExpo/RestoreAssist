/**
 * Release Gate Scorer — RA-4956
 *
 * Computes the 100-point production go-live score defined in docs/RELEASE_GATE.md.
 * Machine-verifiable criteria run as shell checks; owner-evidence criteria are
 * counted as PASS only when a dated evidence file exists under
 * docs/evidence/release-gate/<gate_version>/.
 *
 * Usage:
 *   pnpm tsx scripts/release-gate-score.ts               # human-readable dry-run
 *   pnpm tsx scripts/release-gate-score.ts --json        # writes release-gate-report.json
 *   pnpm tsx scripts/release-gate-score.ts --strict      # exit 1 if score < 100 OR any required item red
 *
 * Fail-closed: --strict + score < 100 -> exit 1. CI uses both flags.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type CriterionStatus = "pass" | "fail" | "skip";

interface Criterion {
  id: string;
  section: "A" | "B" | "C" | "D" | "E" | "F";
  points: number;
  description: string;
  kind: "machine" | "owner-evidence";
  run: () => CriterionResult;
}

interface CriterionResult {
  status: CriterionStatus;
  detail: string;
}

interface ScoreReport {
  gate_version: string;
  generated_at: string;
  git_sha: string;
  total_score: number;
  max_score: number;
  passed: boolean;
  sections: Record<string, { earned: number; max: number }>;
  criteria: Array<{
    id: string;
    section: string;
    points: number;
    kind: "machine" | "owner-evidence";
    description: string;
    status: CriterionStatus;
    detail: string;
  }>;
}

const ROOT = process.cwd();
const GATE_DOC = path.join(ROOT, "docs", "RELEASE_GATE.md");
const EVIDENCE_MAX_AGE_DAYS = 14;

function readGateVersion(): string {
  const text = fs.readFileSync(GATE_DOC, "utf8");
  const m = text.match(/^gate_version:\s*([\d.]+)\s*$/m);
  if (!m) throw new Error(`gate_version not found in ${GATE_DOC}`);
  return m[1];
}

function shellOK(cmd: string, options: { timeout?: number } = {}): CriterionResult {
  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 300_000,
    });
    return { status: "pass", detail: `\`${cmd}\` exit 0` };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer; stdout?: Buffer };
    const exit = e.status ?? "unknown";
    const errOut = (e.stderr?.toString() || e.stdout?.toString() || "").slice(-400).trim();
    return {
      status: "fail",
      detail: `\`${cmd}\` exit ${exit}\n${errOut}`,
    };
  }
}

// Extracts the leading `---` frontmatter block, or null when the file has none.
//
// Both fences must be a standalone `---` line. The previous version tested
// `text.startsWith("---")`, so `---not-frontmatter` opened a block, and located
// the close with `indexOf("\n---")`, so a `----not-a-closing-fence` line closed
// one. Either way a malformed file still parsed and scored points, which is the
// fail-open this branch exists to remove. Found by independent review
// (gpt-5.5), 2026-08-16.
function readFrontmatter(filePath: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? m[1] : null;
}

// Parses YAML-ish frontmatter `status:` value (pass | fail | deferred).
// Returns null when no frontmatter or no status key — caller treats null as
// a missing-status FAIL so legacy un-tagged evidence files do NOT silently
// pass. The frontmatter requirement was added in 1.0.0 after the end-to-end
// scorer test surfaced a DEFERRED file silently passing.
export function readEvidenceStatus(
  filePath: string,
): "pass" | "fail" | "deferred" | null {
  const frontmatter = readFrontmatter(filePath);
  if (frontmatter === null) return null;
  const raw = readUniqueKey(frontmatter, "status");
  if (raw === null) return null;
  return /^(pass|fail|deferred)$/i.test(raw)
    ? (raw.toLowerCase() as "pass" | "fail" | "deferred")
    : null;
}

// Reads exactly one top-level `key: value` from a frontmatter block, or null.
//
// Why "exactly one", and why the anchor is strict: both readers previously used
// `String.match()` without /g, which returns only the FIRST hit, anchored as
// `^\s*key`, which accepts an indented key as though it were top-level. A file
// declaring `status: pass` and then `status: deferred` scored the pass; so did
// one declaring a fresh `verified:` above a stale one. That is the same
// fail-open shape as the mtime bug this module was just fixed for — the check
// could not report the bad state it exists to detect.
//
// The key is counted regardless of whether its value is well-formed, so a
// second `status: nonsense` line is still ambiguity rather than a silent
// single match. Returning null on ambiguity is deliberate: every caller already
// treats null as a FAIL, so unreadable evidence fails closed.
//
// Found by independent review (qwen3.8-max), 2026-08-16.
function readUniqueKey(frontmatter: string, key: string): string | null {
  const re = new RegExp(`^${key}[ \\t]*:[ \\t]*(.*)$`, "gim");
  const hits = [...frontmatter.matchAll(re)];
  return hits.length === 1 ? hits[0][1].trim() : null;
}

// Reads the evidence file's self-declared `verified: YYYY-MM-DD` date. THIS,
// not the file's mtime, is what the freshness rule ages.
//
// Why mtime had to go: release-gate.yml checks the repo out with
// actions/checkout@v7 immediately before running the scorer, and checkout
// writes every file at checkout time. Every evidence file therefore reported
// ~0 days old wherever the gate actually runs, so EVIDENCE_MAX_AGE_DAYS could
// never fire — it only ever bit on a long-lived local checkout. Measured
// 2026-08-16 in a fresh worktree: A3-no-sev1-sev2-open.md was last genuinely
// updated 2026-05-18 (90 days) but its mtime was that morning's checkout, and
// the criterion scored 5 points for a claim a live Linear query contradicts.
//
// Why not the git commit date: release-gate.yml uses fetch-depth: 1, so
// `git log -1 -- <file>` has only the tip commit to report and would call
// every file fresh — the same silent non-firing in a new costume. It is also
// refreshed by any unrelated touch (a lint pass, a squash-merge, a rename),
// which would renew evidence nobody re-verified. A self-declared date can only
// move when someone edits it, which is precisely the act it records.
export function readEvidenceVerifiedDate(filePath: string): Date | null {
  const frontmatter = readFrontmatter(filePath);
  if (frontmatter === null) return null;
  const raw = readUniqueKey(frontmatter, "verified");
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // JS rolls impossible calendar dates FORWARD rather than rejecting them:
  // 2026-02-31 parses as 2026-03-03, 2026-04-31 as 2026-05-01, and a non-leap
  // 2026-02-29 as 2026-03-01. A typo would therefore not merely parse, it would
  // parse as a date up to three days LATER than written — making the evidence
  // look fresher than its own claim. Round-tripping rejects any date the
  // calendar does not actually contain. Found by independent review (gpt-5.5).
  return parsed.toISOString().slice(0, 10) === raw ? parsed : null;
}

export function ownerEvidence(
  criterionId: string,
  gateVersion: string,
  // Overridable so the freshness rule can be exercised against fixtures.
  // Defaults to the real evidence tree, preserving production behaviour.
  evidenceRoot: string = path.join(ROOT, "docs", "evidence", "release-gate"),
): CriterionResult {
  const dir = path.join(evidenceRoot, gateVersion);
  const file = path.join(dir, `${criterionId}.md`);
  if (!fs.existsSync(file)) {
    return {
      status: "fail",
      detail: `evidence file missing: docs/evidence/release-gate/${gateVersion}/${criterionId}.md`,
    };
  }
  // Status is judged before freshness, deliberately. A file declaring `fail` or
  // `deferred` is failing on its own merits whatever its age, and reporting it
  // as "stale" would both bury the actionable reason and invite someone to bump
  // the date on deliberately-deferred work. That habit is exactly what would
  // hollow out a self-declared timestamp, so the rule never asks for it.
  const declaredStatus = readEvidenceStatus(file);
  if (declaredStatus === null) {
    return {
      status: "fail",
      detail: `evidence file ${criterionId}.md is missing required frontmatter \`status: pass | fail | deferred\``,
    };
  }
  if (declaredStatus !== "pass") {
    return {
      status: "fail",
      detail: `evidence file declares status=${declaredStatus} (only \`pass\` counts toward the gate)`,
    };
  }
  // Only a `pass` claim has to be fresh — it is the only kind that earns points.
  const verifiedAt = readEvidenceVerifiedDate(file);
  if (verifiedAt === null) {
    return {
      status: "fail",
      detail: `evidence file ${criterionId}.md declares status=pass but is missing required frontmatter \`verified: YYYY-MM-DD\``,
    };
  }
  const ageDays = (Date.now() - verifiedAt.getTime()) / 86_400_000;
  // A future date would make the claim permanently "fresh" and silently disable
  // the rule for that criterion — the same class of defect this fix exists to
  // remove. One day of slack absorbs timezone skew against the UTC-midnight parse.
  if (ageDays < -1) {
    return {
      status: "fail",
      detail: `evidence file ${criterionId}.md declares a future verified date (${verifiedAt.toISOString().slice(0, 10)})`,
    };
  }
  if (ageDays > EVIDENCE_MAX_AGE_DAYS) {
    return {
      status: "fail",
      detail: `evidence stale: verified ${Math.round(ageDays)}d ago, max ${EVIDENCE_MAX_AGE_DAYS}d: ${criterionId}.md`,
    };
  }
  return {
    status: "pass",
    detail: `evidence file declares status=pass, verified ${Math.round(ageDays)}d ago: ${criterionId}.md`,
  };
}

const GATE_VERSION = readGateVersion();

const CRITERIA: Criterion[] = [
  // A) Product Correctness & Feature Integrity (25)
  {
    id: "A1-core-journeys",
    section: "A",
    points: 10,
    kind: "machine",
    description: "Core user journeys pass E2E via sandbox smoke",
    run: () => shellOK("pnpm test:smoke:sandbox", { timeout: 600_000 }),
  },
  {
    id: "A2-middleware-auth-paywall",
    section: "A",
    points: 10,
    kind: "machine",
    description: "Middleware/auth/paywall tests pass",
    run: () =>
      shellOK(
        "npx vitest run --config config/vitest.config.js lib/__tests__/middleware-*.test.ts",
      ),
  },
  {
    id: "A3-no-sev1-sev2-open",
    section: "A",
    points: 5,
    kind: "owner-evidence",
    description: "Linear query: 0 open Urgent/High RestoreAssist issues",
    run: () => ownerEvidence("A3-no-sev1-sev2-open", GATE_VERSION),
  },

  // B) Automated Quality & CI Reliability (20)
  {
    id: "B1-lint",
    section: "B",
    points: 5,
    kind: "machine",
    description: "`pnpm lint` exit 0",
    run: () => shellOK("pnpm lint"),
  },
  {
    id: "B2-type-check",
    section: "B",
    points: 5,
    kind: "machine",
    description: "`pnpm type-check` exit 0",
    run: () => shellOK("pnpm type-check"),
  },
  {
    id: "B3-tests",
    section: "B",
    points: 5,
    kind: "machine",
    description: "`pnpm test:unit` 0 failures",
    run: () =>
      shellOK("npx vitest run --config config/vitest.config.js", {
        timeout: 600_000,
      }),
  },
  {
    id: "B4-smoke-sandbox",
    section: "B",
    points: 5,
    kind: "machine",
    description: "Playwright sandbox smoke passes",
    run: () => shellOK("pnpm test:smoke:sandbox", { timeout: 600_000 }),
  },

  // C) Security & Compliance (15)
  {
    id: "C1-pnpm-audit",
    section: "C",
    points: 10,
    kind: "machine",
    description: "`pnpm audit --prod --audit-level=moderate` 0 vulns",
    run: () => shellOK("pnpm audit --prod --audit-level=moderate"),
  },
  {
    id: "C2-secrets-scan",
    section: "C",
    points: 5,
    kind: "owner-evidence",
    description: "Secrets scan + env-var completeness verified",
    run: () => ownerEvidence("C2-secrets-scan", GATE_VERSION),
  },

  // D) Billing & Paying-Customer Readiness (15)
  {
    id: "D1-billing-flows",
    section: "D",
    points: 5,
    kind: "owner-evidence",
    description: "Stripe/Apple IAP purchase, renewal, cancellation verified",
    run: () => ownerEvidence("D1-billing-flows", GATE_VERSION),
  },
  {
    id: "D2-paywall-tests",
    section: "D",
    points: 5,
    kind: "machine",
    description: "Billing + webhook test suites pass",
    run: () =>
      shellOK(
        "npx vitest run --config config/vitest.config.js lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/",
      ),
  },
  {
    id: "D3-revenue-reconciliation",
    section: "D",
    points: 5,
    kind: "owner-evidence",
    description: "Stripe events count matches DB subscription_events count (7d window)",
    run: () => ownerEvidence("D3-revenue-reconciliation", GATE_VERSION),
  },

  // E) App Store Launch Operations (15)
  {
    id: "E1-app-store-metadata",
    section: "E",
    points: 5,
    kind: "owner-evidence",
    description: "App Store metadata/screenshots/privacy/age rating approved",
    run: () => ownerEvidence("E1-app-store-metadata", GATE_VERSION),
  },
  {
    id: "E2-testflight-stability",
    section: "E",
    points: 5,
    kind: "owner-evidence",
    description: "TestFlight crash-free sessions >= 99.5%",
    run: () => ownerEvidence("E2-testflight-stability", GATE_VERSION),
  },
  {
    id: "E3-release-rollback-plan",
    section: "E",
    points: 5,
    kind: "machine",
    description: "Release runbook + rollback plan files present",
    run: () => {
      const required = [
        "docs/MOBILE_RELEASE_RUNBOOK.md",
        "docs/PILOT_CUTOVER_CHECKLIST.md",
      ];
      const missing = required.filter((p) => !fs.existsSync(path.join(ROOT, p)));
      return missing.length === 0
        ? { status: "pass", detail: `runbooks present: ${required.join(", ")}` }
        : { status: "fail", detail: `missing: ${missing.join(", ")}` };
    },
  },

  // F) Production Observability & Support (10)
  {
    id: "F1-monitoring-alerting",
    section: "F",
    points: 5,
    kind: "owner-evidence",
    description: "Vercel Observability alert rules configured for auth/billing/restore",
    run: () => ownerEvidence("F1-monitoring-alerting", GATE_VERSION),
  },
  {
    id: "F2-runbooks-sla",
    section: "F",
    points: 5,
    kind: "owner-evidence",
    description: "Runbooks + P1 SLA + customer comms template in place",
    run: () => ownerEvidence("F2-runbooks-sla", GATE_VERSION),
  },
];

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function run(): { report: ScoreReport; strictFail: boolean } {
  const sections: Record<string, { earned: number; max: number }> = {};
  const criteriaResults: ScoreReport["criteria"] = [];
  let total = 0;
  const max = CRITERIA.reduce((sum, c) => sum + c.points, 0);

  for (const c of CRITERIA) {
    process.stderr.write(`[${c.section}] ${c.id} (${c.points}pt) ... `);
    const result = c.run();
    const earned = result.status === "pass" ? c.points : 0;
    total += earned;

    sections[c.section] ??= { earned: 0, max: 0 };
    sections[c.section].earned += earned;
    sections[c.section].max += c.points;

    criteriaResults.push({
      id: c.id,
      section: c.section,
      points: c.points,
      kind: c.kind,
      description: c.description,
      status: result.status,
      detail: result.detail,
    });

    process.stderr.write(`${result.status.toUpperCase()} (${earned}/${c.points})\n`);
  }

  const report: ScoreReport = {
    gate_version: GATE_VERSION,
    generated_at: new Date().toISOString(),
    git_sha: gitSha(),
    total_score: total,
    max_score: max,
    passed: total === max,
    sections,
    criteria: criteriaResults,
  };

  return { report, strictFail: total < max };
}

function main(): void {
  const args = process.argv.slice(2);
  const wantJson = args.includes("--json");
  const strict = args.includes("--strict");

  const { report, strictFail } = run();

  if (wantJson) {
    const outPath = path.join(ROOT, "release-gate-report.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stderr.write(`\nWrote ${outPath}\n`);
  }

  process.stderr.write(
    `\n=== Release Gate ${report.gate_version} ===\n` +
      `Score: ${report.total_score}/${report.max_score}` +
      ` (${report.passed ? "PASS" : "FAIL"})\n` +
      Object.entries(report.sections)
        .map(([s, v]) => `  ${s}: ${v.earned}/${v.max}`)
        .join("\n") +
      "\n",
  );

  if (!wantJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }

  if (strict && strictFail) {
    process.stderr.write(
      `\nFAIL-CLOSED: score ${report.total_score} < ${report.max_score}. Release blocked.\n`,
    );
    process.exit(1);
  }
}

// Only run when invoked directly (`pnpm tsx scripts/release-gate-score.ts`),
// not when imported by a test — the same guard scripts/audit-prod-cves.ts uses.
// Without it, importing this module to test ownerEvidence() would execute every
// criterion, including the smoke suites.
if (/release-gate-score\.ts$/.test(process.argv[1] ?? "")) {
  main();
}
