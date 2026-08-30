/**
 * release-gate-score.test.ts
 *
 * Guards the owner-evidence freshness rule in scripts/release-gate-score.ts.
 *
 * Background — the defect these tests exist to prevent recurring:
 * the freshness rule aged `fs.statSync(file).mtimeMs` against
 * EVIDENCE_MAX_AGE_DAYS. But .github/workflows/release-gate.yml runs
 * actions/checkout@v7 immediately before the scorer, and checkout writes every
 * file at checkout time. Every evidence file therefore looked ~0 days old
 * wherever the gate actually runs, so the 14-day rule could never fire. It bit
 * only on a long-lived local checkout. Measured 2026-08-16: the gate awarded
 * A3-no-sev1-sev2-open 5 points on a claim last verified 2026-05-18 (90 days)
 * that a live Linear query contradicted.
 *
 * The rule now ages the evidence file's self-declared `verified: YYYY-MM-DD`
 * frontmatter date, which no checkout, squash-merge or lint pass can refresh.
 *
 * The load-bearing test here is "stale claim in a freshly-checked-out file":
 * it reproduces the CI condition (brand-new mtime, old claim) and asserts the
 * criterion FAILS. A freshness check that cannot return stale is exactly the
 * defect being fixed, so these tests assert the failing direction first.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign as edSign } from "node:crypto";

import { canonicalizeManifest as canonicalJson } from "../../lib/evidence/manifest-canonical";
import { TRUSTED_KEYS_ENV } from "../ci/release-receipt";

import {
  ownerEvidence,
  parseReleaseProfile,
  readEvidenceVerifiedDate,
  runReleaseGate,
  shellOK,
  verifyReleaseDbProfile,
  verifyRunbooksSla,
} from "../release-gate-score";
import type { Criterion } from "../release-gate-score";

const GATE_VERSION = "1.0.0";

describe("retained command evidence", () => {
  it("never copies planted secret output into the report detail", () => {
    const planted = "RA_PLANTED_SECRET_DO_NOT_RETAIN_7f4b";
    process.env.RA_PLANTED_RELEASE_SECRET = planted;
    const result = shellOK(
      `node -e "process.stderr.write(process.env.RA_PLANTED_RELEASE_SECRET); process.exit(9)"`,
    );
    delete process.env.RA_PLANTED_RELEASE_SECRET;
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("exit 9");
    expect(result.detail).not.toContain(planted);
  });
});

describe("B3 DB-backed release profile", () => {
  const postgres = "postgresql://ci:ci@localhost:5432/ci";

  it("fails closed when the release DB profile marker is missing", () => {
    const result = verifyReleaseDbProfile({
      DATABASE_URL: postgres,
      DIRECT_URL: postgres,
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("RELEASE_DB_PROFILE");
  });

  it("accepts only the complete explicit Postgres profile", () => {
    expect(
      verifyReleaseDbProfile({
        DATABASE_URL: postgres,
        DIRECT_URL: postgres,
        RELEASE_DB_PROFILE: "1",
      }).status,
    ).toBe("pass");
    expect(
      verifyReleaseDbProfile({
        DATABASE_URL: "https://example.test/db",
        DIRECT_URL: postgres,
        RELEASE_DB_PROFILE: "1",
      }).status,
    ).toBe("fail");
  });
});

function assertGitleaksArchiveVerifiedBeforeExtraction(workflow: string): void {
  if (!/ARCHIVE_SHA256="[a-f0-9]{64}"/.test(workflow)) {
    throw new Error("missing pinned Gitleaks archive SHA-256");
  }
  const download = workflow.indexOf('-o "/tmp/${ARCHIVE}"');
  const verify = workflow.indexOf("sha256sum --check --strict");
  const extract = workflow.indexOf('tar -xzf "/tmp/${ARCHIVE}"');
  if (download < 0 || verify <= download || extract <= verify) {
    throw new Error(
      "Gitleaks archive must be downloaded, verified, then extracted",
    );
  }
}

describe("Gitleaks archive supply-chain guard", () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/pr-checks.yml"),
    "utf8",
  );

  it("verifies the pinned SHA-256 before extraction", () => {
    expect(() =>
      assertGitleaksArchiveVerifiedBeforeExtraction(workflow),
    ).not.toThrow();
  });

  it("fails when the reviewed checksum is planted missing", () => {
    const missingChecksum = workflow.replace(
      /ARCHIVE_SHA256="[a-f0-9]{64}"/,
      'ARCHIVE_SHA256=""',
    );
    expect(() =>
      assertGitleaksArchiveVerifiedBeforeExtraction(missingChecksum),
    ).toThrow(/missing pinned/);
  });
});

function assertHistoricalComposioScan(config: string, workflow: string): void {
  if (!/id\s*=\s*"composio-api-key"/.test(config)) {
    throw new Error("missing Composio API key detection rule");
  }
  if (!/ck_\[A-Za-z0-9_-\]\{8,\}/.test(config)) {
    throw new Error("Composio detection rule does not cover ck_ credentials");
  }
  if (/1577f7cec36870638a08a3ae2cc8653321c3b15b/.test(config)) {
    throw new Error("unrotated historical Composio credential is allowlisted");
  }
  if (!/fetch-depth:\s*0/.test(workflow) || !/gitleaks git --config/.test(workflow)) {
    throw new Error("weekly workflow does not scan complete git history");
  }
}

describe("historical Composio credential recurrence guard", () => {
  const config = fs.readFileSync(path.join(process.cwd(), ".gitleaks.toml"), "utf8");
  const workflow = fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/deepsec-weekly.yml"),
    "utf8",
  );

  it("detects ck_ credentials across complete history without allowlisting the exposure", () => {
    expect(() => assertHistoricalComposioScan(config, workflow)).not.toThrow();
  });

  it("fails when the complete-history scan is planted missing", () => {
    const planted = workflow.replace("/tmp/gitleaks git --config", "/tmp/gitleaks version --config");
    expect(() => assertHistoricalComposioScan(config, planted)).toThrow(
      /complete git history/,
    );
  });
});

let evidenceRoot: string;
let versionDir: string;

/** ISO yyyy-mm-dd for a date `daysAgo` days before now. */
function isoDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Writes an evidence file. The file is created right now, so its mtime is
 * always "fresh" — reproducing what actions/checkout does to every file in CI.
 */
function writeEvidence(criterionId: string, frontmatter: string): string {
  const file = path.join(versionDir, `${criterionId}.md`);
  const evidence =
    "Observed the named criterion against the exact release revision and retained the machine or operator receipt linked above. The independent reviewer examined the result and the alternative failure state.";
  if (/^status:\s*pass\s*$/im.test(frontmatter)) {
    const head = execSync("git rev-parse HEAD").toString().trim();
    if (!/^criterion:/im.test(frontmatter))
      frontmatter += `\ncriterion: ${criterionId}`;
    if (!/^release_sha:/im.test(frontmatter))
      frontmatter += `\nrelease_sha: ${head}`;
    if (!/^owner:/im.test(frontmatter)) frontmatter += "\nowner: fixture-owner";
    if (!/^reviewer:/im.test(frontmatter))
      frontmatter += "\nreviewer: fixture-reviewer";
    if (!/^artifact:/im.test(frontmatter)) {
      const receipt = createHash("sha256").update(evidence).digest("hex");
      frontmatter += `\nartifact: sha256:${receipt}`;
    }
  }
  fs.writeFileSync(
    file,
    `---\n${frontmatter}\n---\n\n## Evidence\n${evidence}\n\n## Not checked\nThis fixture does not claim production truth; it exercises only the release-gate evidence parser and freshness contract.\n`,
  );
  return file;
}

beforeEach(() => {
  evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ra-release-gate-"));
  versionDir = path.join(evidenceRoot, GATE_VERSION);
  fs.mkdirSync(versionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(evidenceRoot, { recursive: true, force: true });
});

describe("ownerEvidence — freshness rule", () => {
  // POSITIVE CONTROL (the failing direction), and the exact CI condition:
  // the file was written moments ago, so mtime is ~0 days old, but the claim
  // it carries is 40 days old. The old mtime-based rule passed this. It must fail.
  it("fails a stale claim even when the file itself was just written", () => {
    writeEvidence(
      "A3-no-sev1-sev2-open",
      `criterion: A3-no-sev1-sev2-open\nstatus: pass\nverified: ${isoDaysAgo(40)}`,
    );

    const file = path.join(versionDir, "A3-no-sev1-sev2-open.md");
    const mtimeAgeDays = (Date.now() - fs.statSync(file).mtimeMs) / 86_400_000;
    // Prove the fixture really does reproduce the CI condition, so this test
    // cannot quietly stop testing what it claims to test.
    expect(mtimeAgeDays).toBeLessThan(1);

    const result = ownerEvidence(
      "A3-no-sev1-sev2-open",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("stale");
  });

  it("does not award points to a fresh self-attested narrative", () => {
    writeEvidence(
      "A3-no-sev1-sev2-open",
      `criterion: A3-no-sev1-sev2-open\nstatus: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const result = ownerEvidence(
      "A3-no-sev1-sev2-open",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not machine-verifiable");
  });

  it("rejects a shaped SHA-256 that is not bound to the evidence section", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(1)}\nartifact: sha256:${"0".repeat(64)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not bound");
  });

  it("does not credit criterion terms that appear only under Not checked", () => {
    const criterionId = "E3-release-rollback-plan";
    const head = execSync("git rev-parse HEAD").toString().trim();
    const evidence =
      "No production control was executed. This paragraph exists only to prove that a long narrative cannot substitute for an affirmative observation in the evidence section.";
    const receipt = createHash("sha256").update(evidence).digest("hex");
    fs.writeFileSync(
      path.join(versionDir, `${criterionId}.md`),
      `---\ncriterion: ${criterionId}\nstatus: pass\nverified: ${isoDaysAgo(1)}\nrelease_sha: ${head}\nowner: owner\nreviewer: reviewer\nartifact: sha256:${receipt}\n---\n\n## Evidence\n${evidence}\n\n## Not checked\nApp Review, release, rollback, and reviewer evidence were not checked.\n`,
    );
    const result = ownerEvidence(criterionId, GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("criterion-specific");
  });

  it("requires the full documented A1 journey, not only the old partial terms", () => {
    const criterionId = "A1-core-journeys";
    const head = execSync("git rev-parse HEAD").toString().trim();
    const evidence =
      "The signup, inspection, claim, attestation and PDF checkpoints were observed. This deliberately omits four independently documented stages between entry and the first inspection so a partial journey cannot score.";
    const receipt = createHash("sha256").update(evidence).digest("hex");
    fs.writeFileSync(
      path.join(versionDir, `${criterionId}.md`),
      `---\ncriterion: ${criterionId}\nstatus: pass\nverified: ${isoDaysAgo(1)}\nrelease_sha: ${head}\nowner: owner\nreviewer: reviewer\nartifact: sha256:${receipt}\n---\n\n## Evidence\n${evidence}\n\n## Not checked\nThe deliberately omitted stages were not checked in this attack fixture.\n`,
    );
    const result = ownerEvidence(criterionId, GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("criterion-specific");
    expect(result.detail).toContain("login");
    expect(result.detail).toContain("onboarding");
    expect(result.detail).toContain("storage setup");
    expect(result.detail).toContain("restore");
  });

  it("rejects a semantically empty markdown or comment shell", () => {
    const head = execSync("git rev-parse HEAD").toString().trim();
    const file = path.join(versionDir, "E3-release-rollback-plan.md");
    fs.writeFileSync(
      file,
      `---\ncriterion: E3-release-rollback-plan\nstatus: pass\nverified: ${isoDaysAgo(1)}\nrelease_sha: ${head}\nowner: owner\nreviewer: reviewer\nartifact: sha256:${"a".repeat(64)}\n---\n\n#\n<!-- -->\n`,
    );
    expect(
      ownerEvidence("E3-release-rollback-plan", GATE_VERSION, evidenceRoot)
        .status,
    ).toBe("fail");
  });

  it("fails when the verified date is missing entirely", () => {
    writeEvidence(
      "C2-secrets-scan",
      "criterion: C2-secrets-scan\nstatus: pass",
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("verified");
  });

  // A future date would pin ageDays negative forever and silently disable the
  // rule for that criterion — the same class of defect as the mtime bug.
  it("fails a future-dated verified claim", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(-30)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("future");
  });

  // The one day of future slack is deliberate, not incidental: dates parse at
  // UTC midnight, so someone in UTC+10 writing today's date is briefly "ahead"
  // of now. Pinned here so nobody tightens it and starts failing honest entries.
  it("accepts today's date for parsing but still refuses narrative release points", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(-1)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not machine-verifiable");
  });

  it("fails when the evidence file is absent", () => {
    const result = ownerEvidence("F2-runbooks-sla", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("missing");
  });

  // Pre-existing behaviour that must survive this change.
  it("fails a fresh claim that declares status=deferred", () => {
    writeEvidence(
      "D1-billing-flows",
      `criterion: D1-billing-flows\nstatus: deferred\nverified: ${isoDaysAgo(1)}`,
    );
    const result = ownerEvidence(
      "D1-billing-flows",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("deferred");
  });

  // Ordering is load-bearing: a deferred claim must report as deferred, not as
  // stale, so the actionable reason survives and nobody is nudged into bumping
  // a verified date on work that is deliberately paused.
  it("reports a stale deferred claim as deferred, not as stale", () => {
    writeEvidence(
      "D3-revenue-reconciliation",
      `criterion: D3-revenue-reconciliation\nstatus: deferred\nverified: ${isoDaysAgo(90)}`,
    );
    const result = ownerEvidence(
      "D3-revenue-reconciliation",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("deferred");
    expect(result.detail).not.toContain("stale");
  });

  // A pass claim with no date must not slip through just because it says pass.
  it("fails a pass claim that omits the verified date", () => {
    writeEvidence(
      "F2-runbooks-sla",
      "criterion: F2-runbooks-sla\nstatus: pass",
    );
    const result = ownerEvidence("F2-runbooks-sla", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("verified");
  });

  it("fails a fresh, pass-declaring file that has no frontmatter at all", () => {
    const file = path.join(versionDir, "F1-monitoring-alerting.md");
    fs.writeFileSync(file, "# F1\n\nStatus: pass\nVerified: today\n");
    const result = ownerEvidence(
      "F1-monitoring-alerting",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("fail");
  });
});

describe("readEvidenceVerifiedDate", () => {
  it("parses a well-formed verified date", () => {
    const file = writeEvidence("A3", "status: pass\nverified: 2026-05-18");
    expect(readEvidenceVerifiedDate(file)?.toISOString().slice(0, 10)).toBe(
      "2026-05-18",
    );
  });

  it("returns null for a malformed date rather than a wrong one", () => {
    const file = writeEvidence("A3", "status: pass\nverified: last Tuesday");
    expect(readEvidenceVerifiedDate(file)).toBeNull();
  });
});

// Found by independent review (qwen3.8-max) of this branch, 2026-08-16.
//
// Both frontmatter readers used `String.match()` without /g, which returns the
// FIRST hit only, and anchored with `^\s*`, which accepts an indented key as
// though it were top-level. A file declaring two conflicting values therefore
// scored on whichever appeared first. That is the same fail-open shape as the
// mtime bug this branch exists to remove: the check cannot report the bad state
// it is there to detect. Ambiguous frontmatter must fail closed.
describe("frontmatter keys must be unambiguous", () => {
  it("fails a file declaring status twice, even when pass comes first", () => {
    writeEvidence(
      "C2-secrets-scan",
      `status: pass\nverified: ${isoDaysAgo(1)}\nstatus: deferred`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
  });

  it("fails a file declaring verified twice, even when the fresh date is first", () => {
    writeEvidence(
      "C2-secrets-scan",
      `status: pass\nverified: ${isoDaysAgo(1)}\nverified: 2020-01-01`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
  });

  it("does not read an indented status as the top-level declaration", () => {
    const file = writeEvidence(
      "C2-secrets-scan",
      `notes:\n  status: pass\nverified: ${isoDaysAgo(1)}`,
    );
    // No top-level `status:` exists, so this is missing-status, not a pass.
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("status");
    expect(readEvidenceVerifiedDate(file)?.toISOString().slice(0, 10)).toBe(
      isoDaysAgo(1),
    );
  });

  it("parses a single well-formed pair but does not score self-attestation", () => {
    writeEvidence(
      "C2-secrets-scan",
      `status: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not machine-verifiable");
  });

  it("rejects a plausible HTTPS URL because reachability is not attestation", () => {
    writeEvidence(
      "C2-secrets-scan",
      `status: pass\nverified: ${isoDaysAgo(1)}\nartifact: https://example.com/fake-green-receipt`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("URLs and narrative links");
  });
});

// Second independent review round (gpt-5.5) of commit c8771bf2. Three further
// fail-open paths, all in readFrontmatter's fence handling and date parsing.
// Same shape as everything else this branch removes: malformed evidence that
// scores points instead of failing closed.
describe("malformed frontmatter fences fail closed", () => {
  /** Writes a raw evidence file, bypassing writeEvidence's well-formed fences. */
  function writeRaw(criterionId: string, body: string): string {
    const file = path.join(versionDir, `${criterionId}.md`);
    fs.writeFileSync(file, body);
    return file;
  }

  it("rejects an opening fence that is not a standalone --- line", () => {
    writeRaw(
      "C2-secrets-scan",
      `---not-frontmatter\nstatus: pass\nverified: ${isoDaysAgo(1)}\n---\n\nbody\n`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
  });

  it("does not treat ----not-a-fence as the closing delimiter", () => {
    writeRaw(
      "C2-secrets-scan",
      `---\nstatus: pass\nverified: ${isoDaysAgo(1)}\n----not-a-closing-fence\nbody\n`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("fail");
  });
});

// JS rolls impossible calendar dates FORWARD: new Date("2026-02-31") is
// 2026-03-03. A typo therefore does not just parse — it parses as a date up to
// three days LATER than written, making the evidence look fresher than its own
// claim. Measured on node: 2026-02-31 -> 2026-03-03, 2026-04-31 -> 2026-05-01,
// 2026-02-29 -> 2026-03-01.
describe("impossible calendar dates are rejected, not rolled forward", () => {
  it.each(["2026-02-31", "2026-04-31", "2026-02-29"])(
    "returns null for %s rather than a later real date",
    (bad) => {
      const file = writeEvidence("A3", `status: pass\nverified: ${bad}`);
      expect(readEvidenceVerifiedDate(file)).toBeNull();
    },
  );

  it("still accepts a real leap day", () => {
    const file = writeEvidence("A3", "status: pass\nverified: 2024-02-29");
    expect(readEvidenceVerifiedDate(file)?.toISOString().slice(0, 10)).toBe(
      "2024-02-29",
    );
  });
});

describe("verifyRunbooksSla", () => {
  function writeDoc(root: string, relativePath: string, body: string): void {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }

  function completeSupportDocs(root: string): void {
    writeDoc(
      root,
      "docs/MOBILE_RELEASE_RUNBOOK.md",
      [
        "# Mobile release runbook",
        "## 1. Pre-flight",
        "| Check | Owner | Done |\n|---|---|---|\n| Validate signing, secrets, production URLs, and rollback owner before any build is created. | release owner | [ ] |",
        "## 5. Build + upload",
        "| Check | Owner | Done |\n|---|---|---|\n| Build signed binaries, retain checksums, upload to internal tracks, and record provider build identifiers. | release owner | [ ] |",
        "## 6. Soft launch",
        "| Check | Owner | Done |\n|---|---|---|\n| Install the candidate and exercise authentication, creation, export, offline recovery, and rollback tests with named internal testers for seven days. | QA owner | [ ] |",
        "## 7. Public production submission",
        "| Check | Owner | Done |\n|---|---|---|\n| Confirm soft-launch evidence, privacy declarations, phased release, support coverage, and owner-only submission approval. | owner | [ ] |",
        "## 8. Post-launch",
        "| Check | Owner | Done |\n|---|---|---|\n| Monitor crash-free sessions, authentication, billing, exports, reviews, and rollback thresholds after publication. | on-call | [ ] |",
      ].join("\n\n"),
    );
    writeDoc(
      root,
      "docs/PILOT_CUTOVER_CHECKLIST.md",
      "# Pilot cutover\n\n## Rollback decision tree\n\n| Signal | Severity | Action |\n|---|---|---|\n| All users receive 5xx | P0 | Roll back the release |\n| Provider spend exceeds guard | P1 | Revoke the key and restore the prior budget |",
    );
    writeDoc(
      root,
      "docs/SUPPORT_SLA.md",
      "# Support SLA\n\n## Response-time commitments\n\n| Severity | First human response | Status update cadence | Resolution target |\n|---|---|---|---|\n| **P1** | **<=1 h** | Every 2 h | <=24 h |",
    );
    writeDoc(
      root,
      "docs/CUSTOMER_COMMS_TEMPLATE.md",
      [
        "## Template A — Initial acknowledgement\n```\nSubject: P1 incident\nThis started at {time}. Next update by {time}. Workaround: {action}.\n```",
        "## Template B — Progress update\n```\nSubject: P1 update\nWhat we know: {facts}. What we ruled out: {causes}. Next update by {time}.\n```",
        "## Template C — Resolution notice\n```\nSubject: RESOLVED: {incident}\nRoot cause: {cause}. What we've changed: {change}. Anything you need to do: {action}.\n```",
        "## Template D — Post-mortem\n```\nSubject: Post-mortem: {incident}\nTimeline: {events}. Root cause: {cause}. Action items: {items}. Customer impact: {impact}.\n```",
        "## Template E — Compliance incident\n```\nSubject: COMPLIANCE NOTICE: {issue}\nImmediate steps: {steps}. Customer-side action: {action}. Remediation plan: {plan}.\n```",
      ].join("\n\n"),
    );
  }

  it("passes when the required support docs and content are present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      expect(verifyRunbooksSla(root)).toEqual({
        status: "pass",
        detail:
          "release-support docs present with P1 <=1 h, templates A-E, and rollback decision tree",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when any required support doc is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      fs.rmSync(path.join(root, "docs", "CUSTOMER_COMMS_TEMPLATE.md"));
      const result = verifyRunbooksSla(root);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("required release-support docs missing");
      expect(result.detail).toContain(
        "customerComms=docs/CUSTOMER_COMMS_TEMPLATE.md",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the P1 SLA no longer commits to <=1 h", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response | Status update cadence | Resolution target |\n|---|---|---|---|\n| **P1** | **<=2 h** | Every 2 h | <=24 h |",
      );
      const result = verifyRunbooksSla(root);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("P1 row");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects marker-only support documents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/CUSTOMER_COMMS_TEMPLATE.md",
        ["A", "B", "C", "D", "E"]
          .map((label) => `## Template ${label}`)
          .join("\n\n"),
      );
      const result = verifyRunbooksSla(root);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("missing or incomplete templates");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects conflicting duplicate P1 commitments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response |\n|---|---|\n| P1 | <=1 h |\n| P1 | <=8 h |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate SLA and template sections even when the first copy is valid", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      fs.appendFileSync(
        path.join(root, "docs/SUPPORT_SLA.md"),
        "\n\n## Response-time commitments\n| Severity | First human response |\n|---|---|\n| P1 | <=8 h |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");

      completeSupportDocs(root);
      fs.appendFileSync(
        path.join(root, "docs/CUSTOMER_COMMS_TEMPLATE.md"),
        "\n\n## Template A — conflicting copy\n```\nSubject: no service commitment is made in this duplicate section.\n```",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a conditional P1 commitment that degrades outside staffed hours", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response |\n|---|---|\n| P1 | <=1 h when staffed; otherwise <=8 h |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // The gate used to demand an unconditional <=1 h, which the real
  // docs/SUPPORT_SLA.md does not offer: P1 is <=1 h in AEST business hours and
  // <=2 h outside them. The owner chose to keep the staffed commitment and
  // relax the check, so the shape is now admitted -- but only with the bound
  // still written down. The three cases below are the whole of that decision:
  // stated and <=2 h passes, unstated fails, worse-than-2 h fails.
  it("accepts a P1 commitment that degrades to a stated bound no worse than 2 h", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response |\n|---|---|\n| **P1** | **\u22641 h** (business hours AEST 08:00-18:00); \u22642 h outside |",
      );
      expect(verifyRunbooksSla(root).status).toBe("pass");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a P1 commitment restricted to stated hours with no fallback at all", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response |\n|---|---|\n| **P1** | **\u22641 h** (business hours AEST 08:00-18:00) |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a stated fallback that is worse than 2 h", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/SUPPORT_SLA.md",
        "## Response-time commitments\n\n| Severity | First human response |\n|---|---|\n| **P1** | **\u22641 h** (business hours AEST 08:00-18:00); \u22648 h outside |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Regression: a `#` comment inside a fenced code block is not a heading. The
  // section reader used to stop at one, truncating the real "Build + upload"
  // section of docs/MOBILE_RELEASE_RUNBOOK.md to 186 characters and zero table
  // rows -- reported as a non-operational section when nothing was wrong with
  // the document. Without the fence rule this case fails.
  it("reads a whole section past a shell comment inside a fenced code block", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      const mobile = fs.readFileSync(
        path.join(root, "docs", "MOBILE_RELEASE_RUNBOOK.md"),
        "utf8",
      );
      writeDoc(
        root,
        "docs/MOBILE_RELEASE_RUNBOOK.md",
        mobile.replace(
          "## 5. Build + upload",
          "## 5. Build + upload\n\n```bash\n# Bump the version, then tag.\ngit tag v1.0.0\n```",
        ),
      );
      expect(verifyRunbooksSla(root).status).toBe("pass");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects hidden, prefix-only, empty, padded and negated marker documents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      const hidden = {
        A: "Subject: P1\nstarted at\nNext update by\nworkaround",
        B: "Subject: P1\nWhat we know\nruled out\nNext update by",
        C: "Subject: RESOLVED\nRoot cause:\nWhat we've changed\nneed to do",
        D: "Subject: Post-mortem\nTimeline\nRoot cause:\nAction items\nCustomer impact",
        E: "Subject: COMPLIANCE NOTICE\nImmediate steps\nCustomer-side action\nremediation plan",
      };
      writeDoc(
        root,
        "docs/CUSTOMER_COMMS_TEMPLATE.md",
        Object.entries(hidden)
          .map(
            ([label, body]) =>
              `## Template ${label}ardvark\n<!-- \`\`\`\n${body}\n\`\`\` -->`,
          )
          .join("\n"),
      );
      writeDoc(
        root,
        "docs/PILOT_CUTOVER_CHECKLIST.md",
        "## Rollback decision tree\n| Signal | Severity | Action |\n|---|---|---|\n| none | P0 | Do not roll back or restore anything |\n| none | P1 | Never revoke or disable anything |",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires template fields inside the copyable fenced body", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      const file = path.join(root, "docs/CUSTOMER_COMMS_TEMPLATE.md");
      const original = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        original.replace(
          /## Template A[^\n]*\n```[\s\S]*?```/,
          "## Template A — Initial acknowledgement\nSubject: P1; started at; Next update by; workaround\n```\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n```",
        ),
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a rollback heading without actionable P0 and P1 table rows", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-runbooks-sla-"));
    try {
      completeSupportDocs(root);
      writeDoc(
        root,
        "docs/PILOT_CUTOVER_CHECKLIST.md",
        "## Rollback decision tree\n\nRollback when needed.",
      );
      expect(verifyRunbooksSla(root).status).toBe("fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseReleaseProfile", () => {
  it.each([
    { args: ["--profile"] },
    { args: ["--profile="] },
    { args: ["--profile", "--json"] },
  ])("rejects a missing profile value in $args", ({ args }) => {
    expect(() => parseReleaseProfile(args)).toThrow(
      /Missing release profile value/,
    );
  });

  it("still defaults to the fail-closed mobile profile when no flag is supplied", () => {
    expect(parseReleaseProfile(["--json"])).toBe("mobile");
  });

  it.each([
    ["--profile=web", "--profile", "mobile"],
    ["--profile=mobile", "--profile=web"],
    ["--profile=web", "--profile=invalid"],
  ])("rejects repeated or conflicting profile flags: %j", (...args) => {
    expect(() => parseReleaseProfile(args)).toThrow(/exactly once/);
  });
});

describe("runReleaseGate profiles", () => {
  const fakeCriterion = (
    id: string,
    points: number,
    profiles: Criterion["profiles"],
    status: "pass" | "fail",
    section: Criterion["section"] = "A",
  ): Criterion => ({
    id,
    section,
    points,
    kind: "machine",
    profiles,
    description: `${id} fixture`,
    run: () => ({ status, detail: `${id} ${status}` }),
  });

  it("web excludes mobile-only criteria from max score but still fails on any applicable red item", () => {
    const criteria: Criterion[] = [
      fakeCriterion("A-pass", 10, ["web", "mobile"], "pass"),
      fakeCriterion("F2-pass", 5, ["web", "mobile"], "pass", "F"),
      fakeCriterion("D-fail", 5, ["web", "mobile"], "fail", "D"),
      fakeCriterion("E1-mobile-only", 5, ["mobile"], "fail", "E"),
    ];

    const { report, strictFail } = runReleaseGate("web", criteria);
    expect(report.profile).toBe("web");
    expect(report.max_score).toBe(20);
    expect(report.total_score).toBe(15);
    expect(report.passed).toBe(false);
    expect(report.criteria.map((criterion) => criterion.id)).toEqual([
      "A-pass",
      "F2-pass",
      "D-fail",
    ]);
    expect(strictFail).toBe(true);
  });

  it("mobile still requires E1-E3 because they remain applicable criteria", () => {
    const criteria: Criterion[] = [
      fakeCriterion("A-pass", 10, ["web", "mobile"], "pass"),
      fakeCriterion("E1-app-store-metadata", 5, ["mobile"], "fail", "E"),
      fakeCriterion("E2-testflight-stability", 5, ["mobile"], "pass", "E"),
      fakeCriterion("E3-release-rollback-plan", 5, ["mobile"], "pass", "E"),
    ];

    const { report, strictFail } = runReleaseGate("mobile", criteria);
    expect(report.profile).toBe("mobile");
    expect(report.max_score).toBe(25);
    expect(report.total_score).toBe(20);
    expect(report.passed).toBe(false);
    expect(report.criteria.map((criterion) => criterion.id)).toEqual([
      "A-pass",
      "E1-app-store-metadata",
      "E2-testflight-stability",
      "E3-release-rollback-plan",
    ]);
    expect(strictFail).toBe(true);
  });
});

/**
 * End-to-end: the criterion that could never pass, passing.
 *
 * Before scripts/ci/release-receipt.ts existed, `ownerEvidence()` ended in an
 * unconditional `fail` -- there was no input, however perfect, that returned
 * `pass`. The web profile's ceiling was therefore 50/85 against a release rule
 * of `score == profile_max`, so the gate could not be passed, only bypassed.
 *
 * These two tests are a matched pair and neither means much alone. The first
 * shows a real signed receipt earning the points. The second shows the same
 * evidence file, byte for byte, still scoring zero the moment the trusted key
 * set is absent -- which is the state of every checkout that has not been
 * given the owner's public key, this one included.
 */
describe("ownerEvidence — signed receipts", () => {
  const KEY_ID = "test-release-key";

  function issueReceipt(
    criterionId: string,
    overrides: Record<string, unknown> = {},
  ): string {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const evidence =
      "Observed the named criterion against the exact release revision and retained the machine or operator receipt linked above. The independent reviewer examined the result and the alternative failure state.";
    const receipt = {
      criterionId,
      gateVersion: GATE_VERSION,
      releaseSha: execSync("git rev-parse HEAD").toString().trim(),
      releaseTree: execSync("git rev-parse HEAD^{tree}").toString().trim(),
      environment: "ci",
      issuedAt: new Date().toISOString(),
      evidenceDigest: `sha256:${createHash("sha256").update(evidence).digest("hex")}`,
      measurements: {
        scanner: "gitleaks",
        scannerVersion: "8.28.0",
        scannedRef: "git-checkout-index",
        findings: 0,
        missingEnvVars: 0,
      },
      ...overrides,
    };
    fs.writeFileSync(
      path.join(versionDir, `${criterionId}.receipt.json`),
      JSON.stringify({
        keyId: KEY_ID,
        signature: edSign(
          null,
          Buffer.from(canonicalJson(receipt), "utf8"),
          privateKey,
        ).toString("base64"),
        receipt,
      }),
    );
    return publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  it("awards the points to a verified signed receipt", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const pem = issueReceipt("C2-secrets-scan");
    const previous = process.env[TRUSTED_KEYS_ENV];
    process.env[TRUSTED_KEYS_ENV] = JSON.stringify({
      [KEY_ID]: { publicKey: pem, criteria: ["C2-secrets-scan"] },
    });
    try {
      const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("signed receipt verified");
    } finally {
      if (previous === undefined) delete process.env[TRUSTED_KEYS_ENV];
      else process.env[TRUSTED_KEYS_ENV] = previous;
    }
  });

  it("scores the same evidence zero when no trusted key is configured", () => {
    // The fail-closed default, and the state of any checkout without the
    // owner's key. A receipt file appearing in the repository moves nothing.
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(1)}`,
    );
    issueReceipt("C2-secrets-scan");
    const previous = process.env[TRUSTED_KEYS_ENV];
    delete process.env[TRUSTED_KEYS_ENV];
    try {
      const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("no trusted receipt keys configured");
    } finally {
      if (previous !== undefined) process.env[TRUSTED_KEYS_ENV] = previous;
    }
  });

  it("rejects a receipt whose measurements contradict the criterion", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const pem = issueReceipt("C2-secrets-scan", {
      measurements: {
        scanner: "gitleaks",
        scannerVersion: "8.28.0",
        scannedRef: "git-checkout-index",
        findings: 2,
        missingEnvVars: 0,
      },
    });
    const previous = process.env[TRUSTED_KEYS_ENV];
    process.env[TRUSTED_KEYS_ENV] = JSON.stringify({
      [KEY_ID]: { publicKey: pem, criteria: ["C2-secrets-scan"] },
    });
    try {
      const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("findings is 2");
    } finally {
      if (previous === undefined) delete process.env[TRUSTED_KEYS_ENV];
      else process.env[TRUSTED_KEYS_ENV] = previous;
    }
  });
});
