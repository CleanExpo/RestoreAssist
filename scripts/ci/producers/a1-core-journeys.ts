/**
 * A1-core-journeys producer: measures whether the core user journey was
 * actually exercised, end to end, against a deployment of THIS revision.
 *
 * WHAT A1 RESTED ON BEFORE
 * -----------------------
 * Nothing ran. A1 is the only owner-evidence criterion with no evidence file
 * at all, and `ownerEvidence()` validated it by TEXT MATCHING: the criterion
 * passed if a human wrote a markdown file whose `## Evidence` section contained
 * the words "signup", "login", "onboarding", "storage setup", "restore",
 * "inspection", "claim", "attest" and "pdf".
 *
 * Ten points -- the largest single award in the gate -- for a document
 * containing nine words. Writing "we did not test signup" contains "signup" and
 * satisfies the check as readily as writing that it passed.
 *
 * THE CONTROL THAT MATTERS MOST HERE
 * ----------------------------------
 * The criterion says "independently verified ON THIS SHA", and that phrase is
 * the whole difficulty. A green journey against yesterday's build is evidence
 * about yesterday's build. This is not hypothetical: production was serving a
 * revision older than its own `deploymentSha` field for weeks while every image
 * build went green, and the smoke runner's own words were "production reports
 * no deploymentSha, so it predates that field".
 *
 * So this producer probes the target's `/api/health` and records the revision
 * it reports, and the verifier requires that revision to equal the receipt's
 * `releaseSha`. A journey verified against some other build cannot be signed as
 * this one, whatever the tests say.
 *
 * WHY IT COUNTS SPECS RATHER THAN TRUSTING AN EXIT CODE
 * ----------------------------------------------------
 * Playwright exits 0 when it matches no tests at all. A filter typo, a renamed
 * spec, a `testDir` that moved -- each produces a green run that executed
 * nothing, and "0 failures" reads identically to a passing suite. That is the
 * same defect as A3's query naming a project which did not exist, and as the
 * `.test.mjs` guards `config/vitest.config.js` never picked up.
 *
 * So every declared spec must APPEAR in the report, `testsExecuted` must be
 * positive, and both are pinned by the verifier. A spec that did not run is
 * reported as missing rather than as passing.
 *
 * WHY THE COVERAGE MAP IS INCOMPLETE, AND SAYS SO
 * ----------------------------------------------
 * The criterion names nine journey steps. `A1_STEP_COVERAGE` maps each to the
 * specs that exercise it, and it is deliberately honest about the gap rather
 * than padded to make the criterion passable:
 *
 *   - `restore` has NO covering spec. The matches for "restore" across the
 *     suite are incidental hits on `restoreassist.app`, not exercises of the
 *     storage-restore journey. It maps to an empty list, so A1 fails closed
 *     with `restore` named.
 *
 * The pilot-tester swarm was considered as the instrument and rejected for the
 * same reason. It is a strong harness -- `packages/pilot-tester/src/runner/
 * release-gate.ts` already enforces a 5x7 fixture population, unique sandbox
 * identities and complete grading -- but its journey is
 * "bootstrap auth cookie, create inspection, upload photos, seed readings,
 * generate assessment, grade". That is login, inspection and assessment: three
 * of the nine steps. Signing A1 off it would have been F1's Vercel mistake
 * again, measuring a real thing that is not the thing the criterion names.
 *
 * Usage:
 *   npx tsx scripts/ci/producers/a1-core-journeys.ts --report=<playwright.json> --json
 *
 * This script never signs: it has no access to the signing key and must not.
 */

import { readFileSync } from "node:fs";

/** The nine steps the criterion names. The single owner of this list. */
export const A1_JOURNEY_STEPS = [
  "signup",
  "login",
  "onboarding",
  "storage setup",
  "restore",
  "inspection",
  "claim",
  "attest",
  "pdf",
] as const;

/**
 * The sandbox the journey runs against, pinned by the verifier.
 *
 * Deliberately NOT production. The journey signs up companies, sets up
 * storage and pushes an invoice; running it against production would create
 * customer-visible records on every gate run. The SHA binding is what makes a
 * sandbox run meaningful evidence -- not which host it is, but that the host
 * is serving exactly this revision.
 */
export const A1_BASE_URL = "https://restoreassist-sandbox.vercel.app";

/**
 * Which specs exercise each journey step.
 *
 * Every entry is a claim, checked against the spec's own test titles rather
 * than its filename:
 *
 *   setup-happy-path        "happy path: signup -> ABN -> all sections green ->
 *                            Activate -> dashboard"
 *   first-tradie-flow       "first tradie tomorrow: signup -> setup ->
 *                            inspection -> report -> invoice -> xero push"
 *   auth                    login page, invalid credentials, protected-route
 *                            redirect
 *   setup-storage-google-drive
 *                           "connects via mocked OAuth and shows
 *                            'Connected as <email>'"
 *   job-close-happy-path    "CloseJobPrompt renders for IN_BILLING inspection"
 *   tech-signoff-modal-fresh
 *                           "USER first sign-off opens fresh modal; second
 *                            sign-off opens prefilled"
 *
 * KNOWN WEAKNESS, recorded rather than hidden: `storage setup` rests on a spec
 * that mocks the Google OAuth exchange. That verifies this application's half
 * of the handshake and nothing about the provider's. It is included because the
 * application's half is what the release is changing, but it is weaker evidence
 * than the other entries and should not be read as an end-to-end proof that
 * storage connects.
 */
export const A1_STEP_COVERAGE: Record<string, readonly string[]> = {
  signup: ["setup-happy-path.spec.ts", "first-tradie-flow.spec.ts"],
  login: ["auth.spec.ts"],
  onboarding: ["setup-happy-path.spec.ts", "first-tradie-flow.spec.ts"],
  "storage setup": ["setup-storage-google-drive.spec.ts"],
  // NO COVERING SPEC. See "why the coverage map is incomplete" above.
  restore: [],
  inspection: ["first-tradie-flow.spec.ts", "pilot-workflow.spec.ts"],
  claim: ["job-close-happy-path.spec.ts", "first-tradie-flow.spec.ts"],
  attest: ["tech-signoff-modal-fresh.spec.ts"],
  pdf: ["pilot-workflow.spec.ts", "v2-sketch-workflow.spec.ts"],
};

/** Every spec named by the coverage map, deduplicated. */
export function declaredSpecs(
  coverage: Record<string, readonly string[]> = A1_STEP_COVERAGE,
): string[] {
  return [...new Set(Object.values(coverage).flat())].sort();
}

/** One spec's outcome, reduced from a Playwright JSON report. */
export interface SpecOutcome {
  file: string;
  passed: number;
  failed: number;
  /** Declared, never executed. Not a pass, and reported by name. */
  skipped: number;
}

/** The measurement bag this producer emits, all values receipt-safe scalars. */
export interface A1Measurements {
  source: string;
  baseUrl: string;
  deploymentSha: string;
  testsExecuted: number;
  specsDeclared: string;
  specsMissingFromReport: string;
  skippedSpecs: string;
  failingSpecs: string;
  journeySteps: string;
  coveredSteps: string;
  uncoveredSteps: string;
}

/**
 * Reduce a Playwright JSON report to per-spec outcomes.
 *
 * Walks the suite tree rather than reading a summary total, because a summary
 * cannot distinguish "this spec passed" from "this spec never ran" -- and that
 * distinction is the one this producer exists to preserve.
 */
export function readPlaywrightReport(payload: unknown): SpecOutcome[] {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Playwright report is not an object");
  }
  const suites = (payload as { suites?: unknown }).suites;
  if (!Array.isArray(suites)) {
    throw new Error("Playwright report carries no suites array");
  }

  const byFile = new Map<string, SpecOutcome>();

  const visit = (node: unknown, inheritedFile: string): void => {
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const file =
      typeof record.file === "string" && record.file !== ""
        ? record.file
        : inheritedFile;

    for (const spec of Array.isArray(record.specs) ? record.specs : []) {
      if (typeof spec !== "object" || spec === null) continue;
      const specRecord = spec as Record<string, unknown>;
      const specFile =
        typeof specRecord.file === "string" && specRecord.file !== ""
          ? specRecord.file
          : file;
      const base = specFile.split("/").pop() ?? specFile;
      const outcome =
        byFile.get(base) ?? { file: base, passed: 0, failed: 0, skipped: 0 };

      // NEVER `spec.ok`. It is TRUE for a skipped test.
      //
      // Playwright's own definition (runner/index.js):
      //   ok() { const s = this.outcome();
      //          return s === "expected" || s === "flaky" || s === "skipped"; }
      //
      // So a `test.fixme(true, ...)` spec -- quarantined, never executed --
      // reports ok: true. This producer counted that as PASSED, which marked
      // its journey step covered and inflated `testsExecuted`. The `storage
      // setup` step was green on a spec that has not run since it was
      // quarantined.
      //
      // That is the exact defect this producer exists to close ("0 failures
      // reads identically to a passing suite"), reproduced one layer down.
      // Reading per-test status keeps the three outcomes distinct, because
      // "ran and passed", "ran and failed" and "never ran" are three different
      // claims and only the first is evidence.
      const tests = Array.isArray(specRecord.tests) ? specRecord.tests : [];
      if (tests.length === 0) {
        // No test entries at all: unreadable, so not evidence of a pass.
        outcome.failed += 1;
      }
      for (const test of tests) {
        const status =
          typeof test === "object" && test !== null
            ? (test as Record<string, unknown>).status
            : undefined;
        if (status === "expected" || status === "flaky") outcome.passed += 1;
        else if (status === "skipped") outcome.skipped += 1;
        else outcome.failed += 1;
      }
      byFile.set(base, outcome);
    }

    for (const child of Array.isArray(record.suites) ? record.suites : []) {
      visit(child, file);
    }
  };

  for (const suite of suites) visit(suite, "");
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Reduce the report, the probed revision and the coverage map to measurements.
 *
 * Pure and separately tested: this is where a false pass would be born.
 */
export function summariseA1(input: {
  outcomes: SpecOutcome[];
  deploymentSha: string;
  baseUrl?: string;
  coverage?: Record<string, readonly string[]>;
}): A1Measurements {
  const coverage = input.coverage ?? A1_STEP_COVERAGE;
  const declared = declaredSpecs(coverage);
  const observed = new Map(input.outcomes.map((o) => [o.file, o]));

  // A declared spec absent from the report did not run. Reporting it as
  // missing rather than passing is the whole point: Playwright exits 0 when it
  // matches nothing.
  const missing = declared.filter((spec) => !observed.has(spec)).sort();
  const failing = declared
    .filter((spec) => (observed.get(spec)?.failed ?? 0) > 0)
    .sort();

  // Named, not merely uncovered. A quarantined spec would otherwise show up
  // only as a missing journey step, sending the reader to look for a spec that
  // does not exist rather than at the `test.fixme` that disabled one.
  const skipped = declared
    .filter((spec) => {
      const o = observed.get(spec);
      return o !== undefined && o.skipped > 0;
    })
    .sort();

  const testsExecuted = input.outcomes.reduce(
    (sum, o) => sum + o.passed + o.failed,
    0,
  );

  // A step is covered only when it names at least one spec AND every spec it
  // names ran and passed. Naming a spec that did not run is not coverage.
  const covered = [...A1_JOURNEY_STEPS].filter((step) => {
    const specs = coverage[step] ?? [];
    return (
      specs.length > 0 &&
      specs.every((spec) => {
        const outcome = observed.get(spec);
        return (
          outcome !== undefined &&
          outcome.failed === 0 &&
          outcome.skipped === 0 &&
          outcome.passed > 0
        );
      })
    );
  });
  const uncovered = [...A1_JOURNEY_STEPS].filter((s) => !covered.includes(s));

  return {
    source: "playwright",
    baseUrl: input.baseUrl ?? A1_BASE_URL,
    deploymentSha: input.deploymentSha,
    testsExecuted,
    specsDeclared: declared.join(","),
    specsMissingFromReport: missing.join(","),
    skippedSpecs: skipped.join(","),
    failingSpecs: failing.join(","),
    journeySteps: [...A1_JOURNEY_STEPS].join(","),
    coveredSteps: covered.join(","),
    uncoveredSteps: uncovered.join(","),
  };
}

/**
 * Ask the deployment which revision it is serving.
 *
 * `/api/health` reports `deploymentSha` from `VERCEL_GIT_COMMIT_SHA` or
 * `GIT_SHA`. A deployment that does not report one cannot be bound to a
 * revision, and this throws rather than emitting an empty string that the
 * verifier would have to catch.
 */
export async function probeDeploymentSha(baseUrl: string): Promise<string> {
  const url = new URL("/api/health", baseUrl);
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `${url} redirected to ${response.headers.get("location") ?? "an unnamed target"}; ` +
        "refusing to read the redirect target as the deployment under test",
    );
  }
  // 503 still carries the body: a degraded deployment still reports its SHA.
  if (!response.ok && response.status !== 503) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { deploymentSha?: unknown };
  const sha = payload.deploymentSha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `${url} reported deploymentSha ${JSON.stringify(sha)}, which is not a full commit SHA. ` +
        "A journey cannot be bound to a revision the deployment will not name -- " +
        "this is the exact state production was in while serving a stale build.",
    );
  }
  return sha.toLowerCase();
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting numbers on the command line.
 */
export async function produceA1Measurements(
  reportPath: string,
  baseUrl: string = A1_BASE_URL,
): Promise<A1Measurements> {
  const outcomes = readPlaywrightReport(
    JSON.parse(readFileSync(reportPath, "utf8")),
  );
  return summariseA1({
    outcomes,
    deploymentSha: await probeDeploymentSha(baseUrl),
    baseUrl,
  });
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const reportPath = arg("report");
  if (!reportPath) {
    console.error(
      "--report=<playwright.json> is required. This producer reads a real run's " +
        "report rather than accepting counts, so the measurement cannot be asserted.",
    );
    process.exit(2);
  }
  const m = await produceA1Measurements(reportPath, arg("base-url") ?? A1_BASE_URL);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(m));
    return;
  }
  console.log(
    `${m.testsExecuted} tests executed against ${m.baseUrl} @ ${m.deploymentSha}.`,
  );
  if (m.specsMissingFromReport) {
    console.log(
      `Declared specs that did NOT run: ${m.specsMissingFromReport}. ` +
        "Playwright exits 0 when it matches nothing, so this is a silent " +
        "green, not a pass.",
    );
  }
  if (m.skippedSpecs) {
    console.log(
      `Declared specs that were SKIPPED: ${m.skippedSpecs}. Playwright reports ` +
        "ok: true for a skipped test, so these look like passes in the raw " +
        "report. A quarantined spec is not evidence.",
    );
  }
  if (m.failingSpecs) console.log(`Failing specs: ${m.failingSpecs}`);
  if (m.uncoveredSteps) {
    console.log(
      `Journey steps not verified: ${m.uncoveredSteps}. A1 cannot pass until ` +
        "every step names a spec that ran and passed against this revision.",
    );
  }
}

// Only run when invoked directly, so the pure exports stay importable.
if (process.argv[1]?.endsWith("a1-core-journeys.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
