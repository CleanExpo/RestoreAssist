import { describe, expect, it } from "vitest";

import {
  A1_JOURNEY_STEPS,
  A1_STEP_COVERAGE,
  declaredSpecs,
  readPlaywrightReport,
  summariseA1,
  type SpecOutcome,
} from "../producers/a1-core-journeys";

/**
 * A1 producer unit tests.
 *
 * A1 previously passed on TEXT MATCHING -- ten points, the largest single award
 * in the gate, for a markdown file containing nine words. What is tested here
 * is the reduction that replaces it, and specifically the two ways a journey
 * measurement can be a lie that reads as a pass: a run that executed nothing,
 * and a run that executed against a different build.
 */

function outcome(file: string, passed = 1, failed = 0, skipped = 0): SpecOutcome {
  return { file, passed, failed, skipped };
}

/** Every declared spec passing, which is the only shape that should pass. */
function allPassing(): SpecOutcome[] {
  return declaredSpecs().map((file) => outcome(file));
}

describe("readPlaywrightReport", () => {
  it("walks nested suites and inherits the file from the parent suite", () => {
    // Playwright nests describe blocks as child suites that carry no `file` of
    // their own. Reading only the top level would miss every test inside a
    // describe, and undercounting reads as fewer failures.
    const report = {
      suites: [
        {
          file: "docs/archive/playwright-e2e/auth.spec.ts",
          specs: [{ ok: true, tests: [{ status: "expected" }] }],
          suites: [{ specs: [{ ok: true, tests: [{ status: "expected" }] }, { ok: false, tests: [{ status: "unexpected" }] }] }],
        },
      ],
    };
    expect(readPlaywrightReport(report)).toEqual([
      { file: "auth.spec.ts", passed: 2, failed: 1, skipped: 0 },
    ]);
  });

  it("keys outcomes by basename so a moved testDir does not orphan them", () => {
    const report = {
      suites: [{ file: "some/other/root/auth.spec.ts", specs: [{ ok: true, tests: [{ status: "expected" }] }] }],
    };
    expect(readPlaywrightReport(report)[0].file).toBe("auth.spec.ts");
  });

  it("counts a spec with no ok verdict as failed, not as passed", () => {
    // An interrupted or timed-out spec has no `ok: true`. Treating the absence
    // as success is how a crashed run reports green.
    const report = { suites: [{ file: "a.spec.ts", specs: [{}, { ok: false, tests: [{ status: "unexpected" }] }] }] };
    expect(readPlaywrightReport(report)).toEqual([
      { file: "a.spec.ts", passed: 0, failed: 2, skipped: 0 },
    ]);
  });

  it.each([
    ["a non-object", "green"],
    ["a report with no suites array", { ok: true }],
  ])("refuses %s rather than reading it as zero failures", (_label, payload) => {
    expect(() => readPlaywrightReport(payload)).toThrow();
  });
});

describe("a skipped spec is not a passing spec", () => {
  /**
   * THE DEFECT THIS SUITE MISSED THE FIRST TIME.
   *
   * Playwright's `spec.ok` is TRUE for a skipped test -- its own definition is
   * `status === "expected" || status === "flaky" || status === "skipped"`. The
   * producer read `ok` and counted a quarantined `test.fixme` spec as PASSED,
   * which marked its journey step covered and inflated `testsExecuted`.
   *
   * `docs/archive/playwright-e2e/setup-storage-google-drive.spec.ts` is exactly
   * that: `test.fixme(true, "Quarantined from A1/B4 gate ...")`. The `storage
   * setup` step was green on a spec that has not run since it was quarantined.
   *
   * The original tests never constructed a skipped spec -- they used only
   * `ok: true`, `ok: false` and `{}` -- so the hole was untested rather than
   * mis-tested.
   */
  it("does not count a skipped test as passed", () => {
    const report = {
      suites: [
        {
          file: "docs/archive/playwright-e2e/setup-storage-google-drive.spec.ts",
          specs: [{ ok: true, tests: [{ status: "skipped" }] }],
        },
      ],
    };
    expect(readPlaywrightReport(report)).toEqual([
      {
        file: "setup-storage-google-drive.spec.ts",
        passed: 0,
        failed: 0,
        skipped: 1,
      },
    ]);
  });

  it("ignores ok:true entirely and reads per-test status", () => {
    // ok:true on every spec; only the statuses differ.
    const report = {
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            { ok: true, tests: [{ status: "expected" }] },
            { ok: true, tests: [{ status: "skipped" }] },
            { ok: true, tests: [{ status: "flaky" }] },
          ],
        },
      ],
    };
    expect(readPlaywrightReport(report)).toEqual([
      { file: "a.spec.ts", passed: 2, failed: 0, skipped: 1 },
    ]);
  });

  it("names a skipped spec rather than leaving its step mysteriously uncovered", () => {
    const outcomes = declaredSpecs().map((f) =>
      f === "auth.spec.ts" ? outcome(f, 0, 0, 1) : outcome(f),
    );
    const m = summariseA1({ outcomes, deploymentSha: "a".repeat(40) });
    expect(m.skippedSpecs).toBe("auth.spec.ts");
    // And it must not silently count as coverage.
    expect(m.uncoveredSteps).toContain("login");
  });

  it("does not let a partly-skipped spec cover its step", () => {
    // One test ran and passed, another was quarantined. The step is not proven.
    const outcomes = declaredSpecs().map((f) =>
      f === "auth.spec.ts" ? outcome(f, 1, 0, 1) : outcome(f),
    );
    const m = summariseA1({ outcomes, deploymentSha: "a".repeat(40) });
    expect(m.skippedSpecs).toBe("auth.spec.ts");
    expect(m.uncoveredSteps).toContain("login");
  });

  it("counts a spec with no test entries as failed, not passed", () => {
    // An unreadable spec is not evidence of a pass.
    const report = { suites: [{ file: "a.spec.ts", specs: [{ ok: true }] }] };
    expect(readPlaywrightReport(report)).toEqual([
      { file: "a.spec.ts", passed: 0, failed: 1, skipped: 0 },
    ]);
  });
});

describe("a run that executed nothing is not a pass", () => {
  it("names declared specs absent from the report rather than passing them", () => {
    /**
     * The defect this exists for. Playwright exits 0 when it matches no tests:
     * a filter typo, a renamed spec or a moved testDir each produce a green run
     * that executed nothing, and "0 failures" reads identically to a passing
     * suite. A3's query naming a project that did not exist, one criterion over.
     */
    const m = summariseA1({
      outcomes: [outcome("auth.spec.ts")],
      deploymentSha: "a".repeat(40),
    });
    expect(m.testsExecuted).toBe(1);
    expect(m.specsMissingFromReport).toContain("setup-happy-path.spec.ts");
    expect(m.failingSpecs).toBe("");
  });

  it("reports zero executed tests for an empty report", () => {
    const m = summariseA1({ outcomes: [], deploymentSha: "a".repeat(40) });
    expect(m.testsExecuted).toBe(0);
    expect(m.coveredSteps).toBe("");
  });

  it("does not count a spec that ran zero tests as covering its step", () => {
    // passed: 0, failed: 0 -- present in the report but exercised nothing.
    const outcomes = allPassing().map((o) =>
      o.file === "auth.spec.ts" ? outcome("auth.spec.ts", 0, 0) : o,
    );
    const m = summariseA1({ outcomes, deploymentSha: "a".repeat(40) });
    expect(m.uncoveredSteps).toContain("login");
  });
});

describe("step coverage", () => {
  it("ships honest about the step no spec exercises", () => {
    /**
     * `restore` maps to an empty list. The matches for "restore" across the
     * suite are incidental hits on restoreassist.app, not exercises of the
     * storage-restore journey. Padding the map to make A1 passable would be
     * the exact failure the gate exists to prevent.
     */
    expect(A1_STEP_COVERAGE.restore).toEqual([]);
    const m = summariseA1({
      outcomes: allPassing(),
      deploymentSha: "a".repeat(40),
    });
    expect(m.uncoveredSteps).toBe("restore");
    expect(m.coveredSteps).not.toContain("restore");
  });

  it("marks a step uncovered when any one of its specs fails", () => {
    // `signup` names two specs; one failing must be enough to lose the step.
    const outcomes = allPassing().map((o) =>
      o.file === "first-tradie-flow.spec.ts" ? outcome(o.file, 0, 1) : o,
    );
    const m = summariseA1({ outcomes, deploymentSha: "a".repeat(40) });
    expect(m.failingSpecs).toBe("first-tradie-flow.spec.ts");
    expect(m.uncoveredSteps).toContain("signup");
    expect(m.uncoveredSteps).toContain("inspection");
  });

  it("marks a step uncovered when one of its specs did not run at all", () => {
    const outcomes = allPassing().filter((o) => o.file !== "auth.spec.ts");
    const m = summariseA1({ outcomes, deploymentSha: "a".repeat(40) });
    expect(m.specsMissingFromReport).toBe("auth.spec.ts");
    expect(m.uncoveredSteps).toContain("login");
  });

  it("covers every step once each step names a spec that ran and passed", () => {
    // The positive control: with `restore` given coverage, everything passes.
    const coverage = { ...A1_STEP_COVERAGE, restore: ["auth.spec.ts"] };
    const outcomes = declaredSpecs(coverage).map((f) => outcome(f));
    const m = summariseA1({
      outcomes,
      deploymentSha: "a".repeat(40),
      coverage,
    });
    expect(m.uncoveredSteps).toBe("");
    expect(m.coveredSteps).toBe(m.journeySteps);
  });

  it("pins the criterion's nine steps as a single owned list", () => {
    // scripts/release-gate-score.ts imports this rather than repeating it: a
    // step list that can drift between the thing measuring and the thing
    // scoring can disagree with itself without either side looking wrong.
    expect([...A1_JOURNEY_STEPS]).toEqual([
      "signup",
      "login",
      "onboarding",
      "storage setup",
      "restore",
      "inspection",
      "claim",
      "attest",
      "pdf",
    ]);
    expect(Object.keys(A1_STEP_COVERAGE).sort()).toEqual([...A1_JOURNEY_STEPS].sort());
  });
});
