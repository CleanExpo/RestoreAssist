/**
 * Skip policy for the @smoke suite: a skipped flow is not a passed flow.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `scripts/run-smoke.mjs` takes Playwright's exit status as the verdict on the
 * user flows. **Playwright exits 0 when every test is skipped.** Observed
 * against production on 2026-09-06 (run 34025545434): `1 failed, 3 skipped,
 * 13 passed` — and the three that skipped were the only ones that would have
 * exercised an authenticated surface. `trial-no-paywall.spec.ts` calls
 * `test.skip()` when the gated sign-in helper is unavailable, which on
 * production it correctly always is. So the run rendered `/signup` and, had the
 * unrelated health assertion passed, would have reported the trial-first-run
 * flow green while proving nothing whatever about it.
 *
 * Absence of evidence is not evidence. A run that did not exercise a flow must
 * not be counted as a run in which the flow worked.
 *
 * THE RULE
 * --------
 * A skip is permitted only if it is DECLARED, with a reason, in
 * `scripts/ci/smoke-skip-manifest.json`. An undeclared skip fails the run. So
 * does a declaration that no longer matches a real skip, because a stale
 * exemption is exactly how a suite quietly stops being run. This mirrors
 * `scripts/ci/run-mjs-tests.mjs` and the decision-record rule `pr-checks.yml`
 * already applies to the release-script suite.
 *
 * Declaring a skip does not make the flow proven. It makes the gap NAMED, and
 * the runner prints what the run did not cover.
 */

/**
 * Every spec whose test was skipped, at any nesting depth.
 *
 * @param {object} report Playwright JSON reporter output.
 * @returns {{title: string, file: string}[]}
 */
export function collectSkipped(report) {
  if (!report || !Array.isArray(report.suites)) {
    // A report we cannot read tells us nothing about coverage, and "nothing"
    // must never resolve to "fine". The caller turns this into exit 2.
    throw new Error(
      "smoke skip policy: unreadable Playwright report — coverage is UNPROVEN, which is not a pass",
    );
  }

  const skipped = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const statuses = (spec.tests ?? []).flatMap((t) => [
        t.status,
        ...(t.results ?? []).map((r) => r.status),
      ]);
      if (statuses.some((s) => s === "skipped" || s === "pending")) {
        skipped.push({ title: spec.title, file: spec.file });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  return skipped;
}

/**
 * Compare what skipped against what was declared.
 *
 * @param {object} report Playwright JSON reporter output.
 * @param {Record<string,string>} declaredSkips title -> reason.
 */
export function assessSkips(report, declaredSkips) {
  const declarations = declaredSkips ?? {};
  const skipped = collectSkipped(report);

  const undeclared = skipped.filter((s) => !(s.title in declarations));
  const declared = skipped
    .filter((s) => s.title in declarations)
    .map((s) => ({ ...s, reason: declarations[s.title] }));

  const skippedTitles = new Set(skipped.map((s) => s.title));
  const staleDeclarations = Object.keys(declarations).filter(
    (title) => !skippedTitles.has(title),
  );

  return { undeclared, declared, staleDeclarations };
}

/**
 * The run's exit code once flows AND coverage have been assessed.
 *
 * A real Playwright failure is never masked by clean coverage, and clean
 * coverage never rescues a failure — the two are independent reasons to fail.
 *
 * @param {object} input
 * @param {number|null|undefined} input.flowStatus Playwright's exit status;
 *   null when signal-terminated, which is a failure and not a 0.
 * @param {number} input.undeclaredCount
 * @param {number} input.staleCount
 * @returns {number}
 */
export function smokeCoverageExitCode({
  flowStatus,
  undeclaredCount,
  staleCount,
}) {
  if (undeclaredCount > 0 || staleCount > 0) return 1;
  return flowStatus ?? 1;
}
