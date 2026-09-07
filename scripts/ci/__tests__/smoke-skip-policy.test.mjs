import assert from "node:assert/strict";
import test from "node:test";

import {
  assessSkips,
  collectSkipped,
  smokeCoverageExitCode,
} from "../smoke-skip-policy.mjs";

/** Minimal shape of Playwright's JSON reporter output. */
function report(specs) {
  return {
    suites: [
      {
        title: "root",
        specs: [],
        suites: [
          {
            title: "inner",
            specs: specs.map(([title, status]) => ({
              title,
              file: "docs/archive/playwright-e2e/example.spec.ts",
              tests: [{ status, results: [{ status }] }],
            })),
          },
        ],
      },
    ],
  };
}

test("collectSkipped finds skipped specs at any nesting depth", () => {
  const skipped = collectSkipped(
    report([
      ["public signup renders", "expected"],
      ["authed inspections/new", "skipped"],
      ["authed reports/new", "skipped"],
    ]),
  );
  assert.deepEqual(
    skipped.map((s) => s.title),
    ["authed inspections/new", "authed reports/new"],
  );
});

test("collectSkipped returns nothing when every spec ran", () => {
  const skipped = collectSkipped(report([["public signup renders", "expected"]]));
  assert.deepEqual(skipped, []);
});

test("an UNDECLARED skip is drift — the run proved less than it claims", () => {
  const { undeclared, declared } = assessSkips(
    report([["authed reports/new", "skipped"]]),
    {},
  );
  assert.equal(undeclared.length, 1);
  assert.equal(declared.length, 0);
});

test("a DECLARED skip is accounted for, not silently green", () => {
  const declaredSkips = {
    "authed reports/new": "RA-6792: needs a seeded prod trial account",
  };
  const { undeclared, declared } = assessSkips(
    report([["authed reports/new", "skipped"]]),
    declaredSkips,
  );
  assert.equal(undeclared.length, 0);
  assert.equal(declared.length, 1);
  assert.match(declared[0].reason, /seeded prod trial account/);
});

test("declaring a skip that did not happen is also drift", () => {
  // A declaration that no longer corresponds to a real skip is a stale
  // exemption, and a stale exemption is how a suite quietly stops being run.
  const { staleDeclarations } = assessSkips(report([["a", "expected"]]), {
    "a spec that no longer skips": "reason",
  });
  assert.deepEqual(staleDeclarations, ["a spec that no longer skips"]);
});

test("the exit code fails on an undeclared skip even when Playwright exited 0", () => {
  // THE DEFECT THIS FILE EXISTS FOR. Playwright exits 0 when every test is
  // skipped, so the runner reported success over a run that exercised nothing.
  assert.equal(
    smokeCoverageExitCode({ flowStatus: 0, undeclaredCount: 2, staleCount: 0 }),
    1,
  );
});

test("the exit code stays 0 when the only skips were declared", () => {
  assert.equal(
    smokeCoverageExitCode({ flowStatus: 0, undeclaredCount: 0, staleCount: 0 }),
    0,
  );
});

test("a stale declaration fails the run too", () => {
  assert.equal(
    smokeCoverageExitCode({ flowStatus: 0, undeclaredCount: 0, staleCount: 1 }),
    1,
  );
});

test("a real Playwright failure is never masked by clean coverage", () => {
  assert.equal(
    smokeCoverageExitCode({ flowStatus: 1, undeclaredCount: 0, staleCount: 0 }),
    1,
  );
});

test("a signal-terminated Playwright run is a failure, not a 0", () => {
  assert.equal(
    smokeCoverageExitCode({
      flowStatus: null,
      undeclaredCount: 0,
      staleCount: 0,
    }),
    1,
  );
});

test("an unreadable report is UNPROVEN, never a pass", () => {
  // Absence of evidence about coverage is not evidence of coverage.
  assert.throws(() => collectSkipped(null), /report/i);
  assert.throws(() => collectSkipped({}), /report/i);
});
