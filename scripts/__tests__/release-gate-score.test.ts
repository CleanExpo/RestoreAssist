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

import { ownerEvidence, readEvidenceVerifiedDate } from "../release-gate-score";

const GATE_VERSION = "1.0.0";

let evidenceRoot: string;
let versionDir: string;

/** ISO yyyy-mm-dd for a date `daysAgo` days before now. */
function isoDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Writes an evidence file. The file is created right now, so its mtime is
 * always "fresh" — reproducing what actions/checkout does to every file in CI.
 */
function writeEvidence(criterionId: string, frontmatter: string): string {
  const file = path.join(versionDir, `${criterionId}.md`);
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n# ${criterionId}\n`);
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

  // NEGATIVE CONTROL: the rule must not simply always fail, or it would be
  // just as useless in the opposite direction.
  it("passes a claim verified within the freshness window", () => {
    writeEvidence(
      "A3-no-sev1-sev2-open",
      `criterion: A3-no-sev1-sev2-open\nstatus: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const result = ownerEvidence(
      "A3-no-sev1-sev2-open",
      GATE_VERSION,
      evidenceRoot,
    );
    expect(result.status).toBe("pass");
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
  it("accepts today's date from a UTC+10 author (one day of slack)", () => {
    writeEvidence(
      "C2-secrets-scan",
      `criterion: C2-secrets-scan\nstatus: pass\nverified: ${isoDaysAgo(-1)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("pass");
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
    const result = ownerEvidence("D1-billing-flows", GATE_VERSION, evidenceRoot);
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
    writeEvidence("F2-runbooks-sla", "criterion: F2-runbooks-sla\nstatus: pass");
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

  it("still accepts a single well-formed pair", () => {
    writeEvidence(
      "C2-secrets-scan",
      `status: pass\nverified: ${isoDaysAgo(1)}`,
    );
    const result = ownerEvidence("C2-secrets-scan", GATE_VERSION, evidenceRoot);
    expect(result.status).toBe("pass");
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
