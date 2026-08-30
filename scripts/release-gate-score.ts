/**
 * Release Gate Scorer — RA-4956
 *
 * Computes the profile-scoped production go-live score defined in
 * docs/RELEASE_GATE.md. Machine-verifiable criteria run directly; blocked
 * owner-evidence criteria remain fail-closed until a criterion-specific trusted
 * verifier exists, even when a dated evidence file is present under
 * docs/evidence/release-gate/<gate_version>/.
 *
 * Usage:
 *   npx tsx scripts/release-gate-score.ts --profile=web
 *   npx tsx scripts/release-gate-score.ts --profile=web --json
 *   npx tsx scripts/release-gate-score.ts --profile=mobile --strict
 *
 * Fail-closed: --strict + score < 100 -> exit 1. CI uses both flags.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  trustedKeysFromEnv,
  verifyReleaseReceipt,
} from "./ci/release-receipt";

type CriterionStatus = "pass" | "fail" | "skip";
export type ReleaseProfile = "web" | "mobile";

export interface Criterion {
  id: string;
  section: "A" | "B" | "C" | "D" | "E" | "F";
  points: number;
  description: string;
  kind: "machine" | "owner-evidence";
  profiles: ReleaseProfile[];
  run: () => CriterionResult;
}

export interface CriterionResult {
  status: CriterionStatus;
  detail: string;
}

export interface ScoreReport {
  gate_version: string;
  profile: ReleaseProfile;
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
const ALL_PROFILES: ReleaseProfile[] = ["web", "mobile"];

const FENCE = /^\s*(?:```|~~~)/;
const ATX_HEADING = /^#{1,2}\s+\S/;

/**
 * A `#` comment inside a fenced code block is not a markdown heading.
 *
 * Treating it as one truncated every section containing a shell snippet. In
 * `docs/MOBILE_RELEASE_RUNBOOK.md` the "Build + upload" section collapsed at
 * `# Bump version on main first.` to 186 characters and zero table rows, so
 * F2-runbooks-sla reported it as a missing or non-operational section when the
 * content was simply never read. A gate that mis-scores well-written docs is
 * worse than no gate: it teaches people to write around the parser.
 */
function isHeadingOutsideFence(lines: string[], index: number): boolean {
  if (!ATX_HEADING.test(lines[index].trim())) return false;
  let inFence = false;
  for (let i = 0; i < index; i++) {
    if (FENCE.test(lines[i])) inFence = !inFence;
  }
  return !inFence;
}

function sectionBodyFrom(lines: string[], start: number): string {
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && ATX_HEADING.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

export function markdownSection(body: string, heading: string): string | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start < 0) return null;
  return sectionBodyFrom(lines, start);
}

function markdownSectionMatching(body: string, heading: RegExp): string | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return null;
  return sectionBodyFrom(lines, start);
}

function renderedMarkdown(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, "");
}

function headingCount(body: string, heading: RegExp): number {
  // Same fence rule as sectionBodyFrom: a heading-shaped line inside a code
  // block is sample text, not a section of this document.
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  return lines.filter(
    (line, index) =>
      heading.test(line.trim()) && isHeadingOutsideFence(lines, index),
  ).length;
}

function readGateVersion(): string {
  const text = fs.readFileSync(GATE_DOC, "utf8");
  const m = text.match(/^gate_version:\s*([\d.]+)\s*$/m);
  if (!m) throw new Error(`gate_version not found in ${GATE_DOC}`);
  return m[1];
}

export function shellOK(
  cmd: string,
  options: { timeout?: number } = {},
): CriterionResult {
  try {
    execSync(cmd, {
      cwd: ROOT,
      // Child output belongs in the Actions log, where configured secrets are
      // masked. Never copy arbitrary stdout/stderr into the retained JSON
      // artifact: a failing test can print any inherited environment value.
      stdio: ["ignore", "inherit", "inherit"],
      timeout: options.timeout ?? 300_000,
    });
    return { status: "pass", detail: `\`${cmd}\` exit 0` };
  } catch (err) {
    const e = err as { status?: number };
    const exit = e.status ?? "unknown";
    return {
      status: "fail",
      detail: `\`${cmd}\` exit ${exit}; child output retained only in the masked workflow log`,
    };
  }
}

/**
 * Proves that B3 is running in the DB-backed release profile rather than the
 * deceptively-green, database-less unit-test profile. A URL alone is not
 * enough: both Prisma connection variables and the explicit profile marker
 * must be present, and both URLs must identify Postgres.
 */
export function verifyReleaseDbProfile(
  env: NodeJS.ProcessEnv = process.env,
): CriterionResult {
  const required = [
    "DATABASE_URL",
    "DIRECT_URL",
    "RELEASE_DB_PROFILE",
  ] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return {
      status: "fail",
      detail: `DB-backed release test profile is incomplete; missing ${missing.join(", ")}`,
    };
  }

  if (env.RELEASE_DB_PROFILE !== "1") {
    return {
      status: "fail",
      detail:
        "RELEASE_DB_PROFILE must be exactly 1 for DB-backed release tests",
    };
  }

  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    try {
      const protocol = new URL(env[name]!).protocol;
      if (protocol !== "postgres:" && protocol !== "postgresql:") {
        return { status: "fail", detail: `${name} must be a Postgres URL` };
      }
    } catch {
      return { status: "fail", detail: `${name} must be a valid Postgres URL` };
    }
  }

  return { status: "pass", detail: "DB-backed release test profile is active" };
}

export function runDbBackedReleaseTests(): CriterionResult {
  const profile = verifyReleaseDbProfile();
  if (profile.status !== "pass") return profile;
  return shellOK(
    "node scripts/ci/check-test-parity.mjs --strict && npx vitest run --config config/vitest.config.js",
    { timeout: 600_000 },
  );
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
  const frontmatter = readFrontmatter(file);
  if (frontmatter === null) {
    return {
      status: "fail",
      detail: `evidence file ${criterionId}.md has no frontmatter`,
    };
  }
  const declaredCriterion = readUniqueKey(frontmatter, "criterion");
  const releaseSha = readUniqueKey(frontmatter, "release_sha");
  const owner = readUniqueKey(frontmatter, "owner");
  const reviewer = readUniqueKey(frontmatter, "reviewer");
  const artifact = readUniqueKey(frontmatter, "artifact");
  const expectedSha = gitSha();
  if (declaredCriterion !== criterionId) {
    return {
      status: "fail",
      detail: `evidence criterion mismatch: expected ${criterionId}`,
    };
  }
  if (releaseSha !== expectedSha || !/^[0-9a-f]{40}$/i.test(releaseSha ?? "")) {
    return {
      status: "fail",
      detail: `evidence release_sha is not bound to HEAD ${expectedSha}`,
    };
  }
  if (!owner || !reviewer || owner === reviewer) {
    return {
      status: "fail",
      detail: "evidence requires distinct owner and reviewer identities",
    };
  }
  const shaReceipt = /^sha256:[0-9a-f]{64}$/i.test(artifact ?? "");
  if (!shaReceipt) {
    return {
      status: "fail",
      detail:
        "owner evidence requires a content-bound SHA-256; URLs and narrative links are not machine-verifiable receipts",
    };
  }
  const body = fs
    .readFileSync(file, "utf8")
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
    .trim();
  if (!body) {
    return { status: "fail", detail: "evidence body is empty" };
  }
  const evidenceSection = markdownSection(body, "Evidence");
  const notCheckedSection = markdownSection(body, "Not checked");
  if (evidenceSection === null || notCheckedSection === null) {
    return {
      status: "fail",
      detail: "evidence body requires ## Evidence and ## Not checked sections",
    };
  }
  if (!evidenceSection || !notCheckedSection) {
    return {
      status: "fail",
      detail: "evidence and not-checked sections must both carry content",
    };
  }
  if (shaReceipt) {
    const observedReceipt = createHash("sha256")
      .update(evidenceSection)
      .digest("hex");
    if (artifact?.toLowerCase() !== `sha256:${observedReceipt}`) {
      return {
        status: "fail",
        detail: "SHA-256 receipt is not bound to the ## Evidence section",
      };
    }
  }
  const meaningfulBody = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[`#*_>\[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (meaningfulBody.length < 160) {
    return {
      status: "fail",
      detail:
        "evidence body is too short to carry a reviewable observation and limits",
    };
  }
  const criterionTerms: Record<string, string[]> = {
    "A1-core-journeys": [
      "signup",
      "login",
      "onboarding",
      "storage setup",
      "restore",
      "inspection",
      "claim",
      "attest",
      "pdf",
    ],
    "E3-release-rollback-plan": [
      "app review",
      "release",
      "rollback",
      "reviewer",
    ],
  };
  const meaningfulEvidence = evidenceSection
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[`#*_>\[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const missingTerms = (criterionTerms[criterionId] ?? []).filter(
    (term) => !meaningfulEvidence.toLowerCase().includes(term),
  );
  if (missingTerms.length > 0) {
    return {
      status: "fail",
      detail: `evidence body omits criterion-specific observations: ${missingTerms.join(", ")}`,
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
  // A hash of prose proves only that the prose did not change; it does not
  // prove the external observation. What earns points is a signed receipt from
  // a producer the owner trusts, verified against THIS checkout -- see
  // scripts/ci/release-receipt.ts and the "Unresolved signed-receipt producers"
  // section of docs/RELEASE_GATE.md.
  //
  // Absent such a receipt the criterion still scores zero, exactly as before.
  // That is the fail-closed default and it is load-bearing: no committed file,
  // however well-formed, can move the score on its own.
  const receiptPath = path.join(dir, `${criterionId}.receipt.json`);
  if (!fs.existsSync(receiptPath)) {
    return {
      status: "fail",
      detail:
        `owner evidence is structurally complete but not machine-verifiable: ${criterionId}.md; ` +
        "a signed criterion-specific receipt verifier is required",
    };
  }
  const verified = verifyReleaseReceipt(
    fs.readFileSync(receiptPath, "utf8"),
    {
      criterionId,
      gateVersion,
      releaseSha: expectedSha,
      releaseTree: gitTree(),
      evidenceDigest: `sha256:${createHash("sha256").update(evidenceSection).digest("hex")}`,
      maxAgeDays: EVIDENCE_MAX_AGE_DAYS,
      // Active only in CI, where GITHUB_REPOSITORY is trustworthy. Locally
      // there is nothing to compare against and inventing a value would be
      // theatre; the workflow and ref checks still apply either way.
      repository: process.env.GITHUB_REPOSITORY,
    },
    trustedKeysFromEnv(),
  );
  if (!verified.ok) {
    return {
      status: "fail",
      detail: `signed receipt rejected for ${criterionId}: ${verified.message}`,
    };
  }
  return {
    status: "pass",
    detail: `signed receipt verified for ${criterionId} against ${expectedSha.slice(0, 12)}`,
  };
}

export function verifyRunbooksSla(root: string = ROOT): CriterionResult {
  const requiredFiles = {
    mobileRunbook: path.join(root, "docs", "MOBILE_RELEASE_RUNBOOK.md"),
    pilotChecklist: path.join(root, "docs", "PILOT_CUTOVER_CHECKLIST.md"),
    supportSla: path.join(root, "docs", "SUPPORT_SLA.md"),
    customerComms: path.join(root, "docs", "CUSTOMER_COMMS_TEMPLATE.md"),
  };

  const missing = Object.entries(requiredFiles)
    .filter(([, filePath]) => !fs.existsSync(filePath))
    .map(([label, filePath]) => `${label}=${path.relative(root, filePath)}`);
  if (missing.length > 0) {
    return {
      status: "fail",
      detail: `required release-support docs missing: ${missing.join(", ")}`,
    };
  }

  const supportSla = renderedMarkdown(
    fs.readFileSync(requiredFiles.supportSla, "utf8"),
  );
  if (headingCount(supportSla, /^##\s+Response-time commitments\s*$/i) !== 1) {
    return {
      status: "fail",
      detail:
        "docs/SUPPORT_SLA.md must contain exactly one Response-time commitments section",
    };
  }
  const responseCommitments = markdownSection(
    supportSla,
    "Response-time commitments",
  );
  const p1Rows = (responseCommitments ?? "")
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.replace(/[*_`]/g, "").trim()),
    )
    .filter((cells) => cells[0]?.toUpperCase() === "P1");
  // The P1 first-response commitment may take one of two shapes, and nothing
  // else. Either it is unconditional -- `<=1 h`, optionally marked `(24/7)` or
  // `(all hours)` -- or it degrades outside stated hours, in which case the
  // fallback must be written down and must itself be no worse than 2 h.
  //
  // This deliberately admits `<=1 h (business hours ...); <=2 h outside`, which
  // an earlier revision rejected. What it must never admit is a commitment that
  // degrades without saying how far: `<=1 h when staffed` with no fallback, or
  // one that falls to 8 h, still fails. Relaxing the shape is not the same as
  // dropping the bound, and the bound is the part that protects a customer.
  const UNCONDITIONAL_P1 =
    /^(?:≤|<=)\s*1\s*h(?:our)?s?(?:\s*\((?:24\/7|all hours)\))?\s*$/i;
  const BOUNDED_DEGRADATION_P1 =
    /^(?:≤|<=)\s*1\s*h(?:our)?s?\s*\([^)]+\)\s*;\s*(?:≤|<=)\s*[12]\s*h(?:our)?s?(?:\s+[A-Za-z][A-Za-z ]*)?\s*$/i;
  const p1FirstResponse = p1Rows[0]?.[1] ?? "";
  if (
    p1Rows.length !== 1 ||
    p1Rows[0].length < 2 ||
    !(
      UNCONDITIONAL_P1.test(p1FirstResponse) ||
      BOUNDED_DEGRADATION_P1.test(p1FirstResponse)
    )
  ) {
    return {
      status: "fail",
      detail:
        "docs/SUPPORT_SLA.md must contain exactly one P1 row whose First human response is <=1 h, degrading no further than <=2 h outside stated hours",
    };
  }

  const customerComms = renderedMarkdown(
    fs.readFileSync(requiredFiles.customerComms, "utf8"),
  );
  const templateRequirements: Record<string, RegExp[]> = {
    A: [/Subject:/i, /started at/i, /Next update by/i, /workaround/i],
    B: [/Subject:/i, /What we know/i, /ruled out/i, /Next update by/i],
    C: [
      /Subject:\s*RESOLVED/i,
      /Root cause:/i,
      /What we've changed/i,
      /need to do/i,
    ],
    D: [
      /Subject:\s*Post-mortem/i,
      /Timeline/i,
      /Root cause:/i,
      /Action items/i,
      /Customer impact/i,
    ],
    E: [
      /Subject:\s*COMPLIANCE NOTICE/i,
      /Immediate steps/i,
      /Customer-side action/i,
      /remediation plan/i,
    ],
  };
  const invalidTemplates = Object.entries(templateRequirements).filter(
    ([label, requirements]) => {
      const heading = new RegExp(
        `^##\\s+Template\\s+${label}(?:\\s*(?:—|-).*)?$`,
        "i",
      );
      if (headingCount(customerComms, heading) !== 1) return true;
      const body = markdownSectionMatching(customerComms, heading) ?? "";
      const fencedTemplate = /```[^\n]*\n([\s\S]*?)\n```/.exec(body)?.[1] ?? "";
      return (
        fencedTemplate.trim().length < 40 ||
        requirements.some((requirement) => !requirement.test(fencedTemplate))
      );
    },
  );
  if (invalidTemplates.length > 0) {
    return {
      status: "fail",
      detail: `docs/CUSTOMER_COMMS_TEMPLATE.md has missing or incomplete templates: ${invalidTemplates.map(([label]) => label).join(", ")}`,
    };
  }

  const pilotChecklist = renderedMarkdown(
    fs.readFileSync(requiredFiles.pilotChecklist, "utf8"),
  );
  if (headingCount(pilotChecklist, /^##\s+Rollback decision tree\s*$/i) !== 1) {
    return {
      status: "fail",
      detail:
        "docs/PILOT_CUTOVER_CHECKLIST.md must contain exactly one rollback decision tree section",
    };
  }
  const rollback =
    markdownSection(pilotChecklist, "Rollback decision tree") ?? "";
  const rollbackRows = rollback
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  const hasAction = (severity: "P0" | "P1", verbs: RegExp) =>
    rollbackRows.some(
      (cells) =>
        cells[1]?.toUpperCase() === severity &&
        !/\b(?:do not|don't|never)\b/i.test(cells[2] ?? "") &&
        verbs.test(cells[2] ?? ""),
    );
  if (
    !/^\|\s*Signal\s*\|\s*Severity\s*\|\s*Action\s*\|/im.test(rollback) ||
    !hasAction("P0", /^(?:roll back|restore)\b/i) ||
    !hasAction("P1", /^(?:revoke|disable|roll back|restore)\b/i)
  ) {
    return {
      status: "fail",
      detail:
        "docs/PILOT_CUTOVER_CHECKLIST.md must contain an actionable rollback table with P0 and P1 signals",
    };
  }

  const mobileRunbook = renderedMarkdown(
    fs.readFileSync(requiredFiles.mobileRunbook, "utf8"),
  );
  const requiredMobileSections: Array<[string, RegExp]> = [
    ["Pre-flight", /\b(?:secret|certificate|account|signing)\b/i],
    ["Build + upload", /\bbuild\b[\s\S]*\bupload\b/i],
    [
      "Soft launch",
      /\b(?:install|tester)\b[\s\S]*\b(?:smoke|test|tests|testing)\b/i,
    ],
    [
      "Public production submission",
      /\b(?:submit|submission)\b[\s\S]*\b(?:review|approval)\b/i,
    ],
    ["Post-launch", /\bmonitor\b[\s\S]*\b(?:crash|sentry|rollback|health)\b/i],
  ];
  const incompleteMobileSections = requiredMobileSections.filter(
    ([fragment, actionPattern]) => {
      const matchingHeadings = mobileRunbook
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter(
          (line) =>
            /^##\s+/.test(line) &&
            line.toLowerCase().includes(fragment.toLowerCase()),
        );
      if (matchingHeadings.length !== 1) return true;
      const heading = matchingHeadings[0];
      const body =
        markdownSection(mobileRunbook, heading.replace(/^##\s+/, "")) ?? "";
      const dataRows = body
        .split("\n")
        .filter((line) => /^\|\s*(?!-{3,}\s*\|)[^|]+\|/.test(line)).length;
      return body.length < 120 || dataRows < 2 || !actionPattern.test(body);
    },
  );
  if (incompleteMobileSections.length > 0) {
    return {
      status: "fail",
      detail: `docs/MOBILE_RELEASE_RUNBOOK.md has missing or non-operational sections: ${incompleteMobileSections.map(([fragment]) => fragment).join(", ")}`,
    };
  }

  return {
    status: "pass",
    detail:
      "release-support docs present with P1 <=1 h, templates A-E, and rollback decision tree",
  };
}

export function parseReleaseProfile(args: string[]): ReleaseProfile {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--profile=")) {
      const value = arg.slice("--profile=".length);
      if (!value)
        throw new Error(
          "Missing release profile value. Use --profile=web or --profile=mobile.",
        );
      values.push(value);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(
          "Missing release profile value. Use --profile=web or --profile=mobile.",
        );
      }
      values.push(value);
      index += 1;
    }
  }
  if (values.length > 1) {
    throw new Error("Release profile must be specified exactly once.");
  }
  const raw = values[0] ?? "mobile";
  if (raw === "web" || raw === "mobile") return raw;
  throw new Error(
    `Invalid release profile ${JSON.stringify(raw)}. Use --profile=web or --profile=mobile.`,
  );
}

export function criteriaForProfile(
  profile: ReleaseProfile,
  criteria: Criterion[] = CRITERIA,
): Criterion[] {
  return criteria.filter((criterion) => criterion.profiles.includes(profile));
}

const GATE_VERSION = readGateVersion();

export const CRITERIA: Criterion[] = [
  // A) Product Correctness & Feature Integrity (25)
  {
    id: "A1-core-journeys",
    section: "A",
    points: 10,
    kind: "owner-evidence",
    profiles: ALL_PROFILES,
    description:
      "Signup/login → onboarding → storage setup → restore → inspection → claim → attest → PDF independently verified on this SHA",
    run: () => ownerEvidence("A1-core-journeys", GATE_VERSION),
  },
  {
    id: "A2-middleware-auth-paywall",
    section: "A",
    points: 10,
    kind: "machine",
    profiles: ALL_PROFILES,
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
    profiles: ALL_PROFILES,
    description: "Linear query: 0 open Urgent/High RestoreAssist issues",
    run: () => ownerEvidence("A3-no-sev1-sev2-open", GATE_VERSION),
  },

  // B) Automated Quality & CI Reliability (20)
  {
    id: "B1-lint",
    section: "B",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
    description: "`npm run lint` exit 0",
    run: () => shellOK("npm run lint"),
  },
  {
    id: "B2-type-check",
    section: "B",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
    description: "`npm run type-check` exit 0",
    run: () => shellOK("npm run type-check"),
  },
  {
    id: "B3-tests",
    section: "B",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
    description:
      "DB-backed unit suite runs against Postgres with no env-gated skips or failures",
    run: runDbBackedReleaseTests,
  },
  {
    id: "B4-smoke-sandbox",
    section: "B",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
    description: "Playwright sandbox smoke passes",
    run: () => shellOK("npm run test:smoke:sandbox", { timeout: 600_000 }),
  },

  // C) Security & Compliance (15)
  {
    id: "C1-npm-audit",
    section: "C",
    points: 10,
    kind: "machine",
    profiles: ALL_PROFILES,
    description: "`npm audit --omit=dev --audit-level=moderate` 0 vulns",
    run: () => shellOK("npm audit --omit=dev --audit-level=moderate"),
  },
  {
    id: "C2-secrets-scan",
    section: "C",
    points: 5,
    kind: "owner-evidence",
    profiles: ALL_PROFILES,
    description: "Secrets scan + env-var completeness verified",
    run: () => ownerEvidence("C2-secrets-scan", GATE_VERSION),
  },

  // D) Billing & Paying-Customer Readiness (15)
  {
    id: "D1-billing-flows",
    section: "D",
    points: 5,
    kind: "owner-evidence",
    profiles: ALL_PROFILES,
    description:
      "Website Stripe purchase, renewal, cancellation verified; iOS checkout remains intentionally blocked",
    run: () => ownerEvidence("D1-billing-flows", GATE_VERSION),
  },
  {
    id: "D2-paywall-tests",
    section: "D",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
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
    profiles: ALL_PROFILES,
    description:
      "Stripe events count matches DB subscription_events count (7d window)",
    run: () => ownerEvidence("D3-revenue-reconciliation", GATE_VERSION),
  },

  // E) App Store Launch Operations (15)
  {
    id: "E1-app-store-metadata",
    section: "E",
    points: 5,
    kind: "owner-evidence",
    profiles: ["mobile"],
    description: "App Store metadata/screenshots/privacy/age rating approved",
    run: () => ownerEvidence("E1-app-store-metadata", GATE_VERSION),
  },
  {
    id: "E2-testflight-stability",
    section: "E",
    points: 5,
    kind: "owner-evidence",
    profiles: ["mobile"],
    description: "TestFlight crash-free sessions >= 99.5%",
    run: () => ownerEvidence("E2-testflight-stability", GATE_VERSION),
  },
  {
    id: "E3-release-rollback-plan",
    section: "E",
    points: 5,
    kind: "owner-evidence",
    profiles: ["mobile"],
    description:
      "App Review blockers zero; release and rollback plan independently reviewed",
    run: () => ownerEvidence("E3-release-rollback-plan", GATE_VERSION),
  },

  // F) Production Observability & Support (10)
  {
    id: "F1-monitoring-alerting",
    section: "F",
    points: 5,
    kind: "owner-evidence",
    profiles: ALL_PROFILES,
    // Was "Vercel Observability alert rules configured for auth/billing/restore".
    // That named the wrong platform: production is DigitalOcean App Platform
    // (.do/app.yaml binds restoreassist.app), and the only Vercel project
    // linked to this repository is restoreassist-sandbox, which does not serve
    // that domain. Three alert rules there would have satisfied the old wording
    // while watching preview deployments. The criterion itself, as its evidence
    // file states it, was always platform-neutral.
    description:
      "Monitoring and alerting configured for auth failures, billing webhook errors, and restore/job failures",
    run: () => ownerEvidence("F1-monitoring-alerting", GATE_VERSION),
  },
  {
    id: "F2-runbooks-sla",
    section: "F",
    points: 5,
    kind: "machine",
    profiles: ALL_PROFILES,
    description: "Runbooks + P1 SLA + customer comms template in place",
    run: () => verifyRunbooksSla(),
  },
];

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * HEAD's tree. Bound alongside the commit because the tree is what a scan
 * actually reads: a receipt cannot then be carried across a rebase that keeps
 * the content but changes the SHA, nor reused on a commit with different
 * content.
 */
function gitTree(): string {
  try {
    return execSync("git rev-parse HEAD^{tree}", { cwd: ROOT })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

export function runReleaseGate(
  profile: ReleaseProfile,
  criteria: Criterion[] = CRITERIA,
): { report: ScoreReport; strictFail: boolean } {
  const applicableCriteria = criteriaForProfile(profile, criteria);
  const sections: Record<string, { earned: number; max: number }> = {};
  const criteriaResults: ScoreReport["criteria"] = [];
  let total = 0;
  const max = applicableCriteria.reduce((sum, c) => sum + c.points, 0);

  for (const c of applicableCriteria) {
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

    process.stderr.write(
      `${result.status.toUpperCase()} (${earned}/${c.points})\n`,
    );
  }

  const report: ScoreReport = {
    gate_version: GATE_VERSION,
    profile,
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
  const profile = parseReleaseProfile(args);

  const { report, strictFail } = runReleaseGate(profile);

  if (wantJson) {
    const outPath = path.join(ROOT, "release-gate-report.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stderr.write(`\nWrote ${outPath}\n`);
  }

  process.stderr.write(
    `\n=== Release Gate ${report.gate_version} (${report.profile}) ===\n` +
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

// Only run when invoked directly (`npx tsx scripts/release-gate-score.ts`),
// not when imported by a test — the same guard scripts/audit-prod-cves.ts uses.
// Without it, importing this module to test ownerEvidence() would execute every
// criterion, including the smoke suites.
if (/release-gate-score\.ts$/.test(process.argv[1] ?? "")) {
  main();
}
