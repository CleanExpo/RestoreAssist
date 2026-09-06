import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  C2_CANARY_PATH,
  C2_ENV_SOURCE,
  C2_SCANNED_REF,
  c2CanaryDocument,
  c2CanarySecret,
  parseGitleaksReport,
  readEnvCompleteness,
  summariseC2,
  type GitleaksFinding,
} from "../producers/c2-secrets-scan";

/**
 * C2 producer unit tests.
 *
 * The end-to-end control -- scan the real tracked tree, plant the canary,
 * rescan -- needs the pinned gitleaks binary and runs in CI. What is tested
 * here is the reduction logic, which is where a false pass would actually be
 * born: every failure recorded in
 * docs/evidence/release-gate/1.0.0/C2-secrets-scan.md was an absent
 * measurement wearing the shape of a passing one, not a scanner bug.
 */

const SCAN = {
  scannerVersion: "8.30.1",
  scannedFileCount: 5093,
  findings: [] as GitleaksFinding[],
  controlFindings: [
    { RuleID: "stripe-access-token", File: `/tmp/export/${C2_CANARY_PATH}` },
  ] as GitleaksFinding[],
  envStatus: "ok",
  missingEnvVars: 0,
};

describe("parseGitleaksReport", () => {
  it.each([
    ["a null report (what gitleaks writes for a clean scan)", "null"],
    ["an empty file", ""],
    ["whitespace", "  \n "],
    ["an empty array", "[]"],
  ])("reads %s as zero findings", (_label, raw) => {
    expect(parseGitleaksReport(raw)).toEqual([]);
  });

  it("reads a populated report", () => {
    const raw = '[{"RuleID":"stripe-access-token","File":"docs/a.md"}]';
    expect(parseGitleaksReport(raw)).toEqual([
      { RuleID: "stripe-access-token", File: "docs/a.md" },
    ]);
  });

  it.each([
    ["an object", '{"RuleID":"x"}'],
    ["a bare number", "7"],
    ["a bare string", '"leaks"'],
  ])("refuses to read %s as zero findings", (_label, raw) => {
    // A `?? []` here would turn a malformed report into a clean scan. The
    // whole criterion rests on this number, so an unreadable report is an
    // error, not a zero.
    expect(() => parseGitleaksReport(raw)).toThrow(/neither null nor an array/);
  });
});

describe("readEnvCompleteness", () => {
  it("reads a complete production environment", () => {
    expect(readEnvCompleteness({ checks: { env: { status: "ok" } } })).toEqual({
      envStatus: "ok",
      missingEnvVars: 0,
    });
  });

  it("counts the variables a degraded environment names", () => {
    expect(
      readEnvCompleteness({
        checks: { env: { status: "degraded", missing: ["SENDER_EMAIL", "CRON_SECRET"] } },
      }),
    ).toEqual({ envStatus: "degraded", missingEnvVars: 2 });
  });

  it.each([
    ["a payload that is not an object", "ok"],
    ["a payload with no checks block", { status: "ok" }],
    ["a payload whose checks carry no env block", { checks: { database: { status: "ok" } } }],
    ["a checks.env with no status", { checks: { env: { missing: [] } } }],
    ["a checks.env whose missing is not an array", { checks: { env: { status: "degraded", missing: 3 } } }],
  ])("refuses %s", (_label, payload) => {
    // An endpoint that does not report the check has not reported it as
    // passing. Defaulting any of these to zero would earn the criterion its
    // points from a payload that never mentioned env vars.
    expect(() => readEnvCompleteness(payload)).toThrow();
  });
});

describe("summariseC2", () => {
  it("emits the pinned constants the verifier compares against", () => {
    const m = summariseC2(SCAN);
    expect(m.scanner).toBe("gitleaks");
    expect(m.scannedRef).toBe(C2_SCANNED_REF);
    expect(m.envSource).toBe(C2_ENV_SOURCE);
    expect(m.scannedFileCount).toBe(5093);
    expect(m.findings).toBe(0);
    expect(m.controlCanaryDetected).toBe(true);
  });

  it("counts real findings without counting the canary", () => {
    const m = summariseC2({
      ...SCAN,
      findings: [{ RuleID: "generic-api-key", File: "lib/a.ts" }],
    });
    expect(m.findings).toBe(1);
    expect(m.controlCanaryDetected).toBe(true);
  });

  it("reports the control as failed when the canary path is absent", () => {
    // The instrument is blind. `findings: 0` from a scanner that cannot see
    // the file it was pointed at is silence, not evidence -- which is exactly
    // how the blanket `(?i)\\.md$` allowlist held a PASS.
    expect(summariseC2({ ...SCAN, controlFindings: [] }).controlCanaryDetected).toBe(
      false,
    );
  });

  it("does not accept a finding elsewhere as proof the canary was seen", () => {
    // Matching on count rather than path would let any unrelated finding in
    // the control scan stand in for the canary.
    const m = summariseC2({
      ...SCAN,
      controlFindings: [{ RuleID: "stripe-access-token", File: "/tmp/export/lib/other.ts" }],
    });
    expect(m.controlCanaryDetected).toBe(false);
  });
});

describe("the control canary", () => {
  it("is assignment-shaped and lands at the markdown path", () => {
    const doc = c2CanaryDocument();
    expect(C2_CANARY_PATH.endsWith(".md")).toBe(true);
    expect(doc).toContain(c2CanarySecret());
    expect(doc).toMatch(/stripe_key = "/);
  });

  it("assembles a Stripe-shaped value", () => {
    expect(c2CanarySecret()).toMatch(/^sk_live_[0-9a-zA-Z]{24,}$/);
  });

  it("never appears as a literal in the producer's own source", () => {
    /**
     * The seam this guards is easy to "simplify" away and expensive to lose.
     *
     * This producer's source file is INSIDE the tracked tree it scans. Inlining
     * the canary as a string literal would make the real scan find it, so
     * `findings` could never reach 0 and C2 would fail forever -- the control
     * permanently failing the criterion it exists to make trustworthy.
     *
     * Verified against gitleaks 8.30.1 with this repository's .gitleaks.toml:
     * the assembled value is detected in a .md, and this source scans clean.
     */
    const source = readFileSync(
      join(process.cwd(), "scripts/ci/producers/c2-secrets-scan.ts"),
      "utf8",
    );
    expect(source).not.toContain(c2CanarySecret());
    expect(source).not.toMatch(/sk_live_[0-9a-zA-Z]{20,}/);
  });

  it("is not detectable in this test file either", () => {
    // Same trap, one file over: this test is tracked too.
    const source = readFileSync(
      join(process.cwd(), "scripts/ci/__tests__/c2-secrets-scan.test.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/sk_live_[0-9a-zA-Z]{20,}/);
  });
});
