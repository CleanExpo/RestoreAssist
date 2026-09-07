import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * Guards the production smoke alarm against going back to crying wolf.
 *
 * Production had not been promoted since 2026-08-25, so the freshness
 * preflight returned exit 3 on every fifteen-minute run: ~96 identical failure
 * emails a day. The damaging part was not the noise. Failing that step aborted
 * the job, so the user-flow smoke never ran — for over a day the workflow
 * proved nothing about production, and a real outage would have looked
 * identical to the staleness everyone had stopped reading.
 *
 * These tests run the workflow's own shell, lifted straight out of the YAML,
 * with the preflight's exit code stubbed.
 */

const WORKFLOW = join(process.cwd(), ".github", "workflows", "smoke-prod.yml");
const WATCH_CRON = "*/15 * * * *";
const STALENESS_CRON = "23 22 * * *";

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, unknown>;
  if?: string;
}

function workflow() {
  return parse(readFileSync(WORKFLOW, "utf8")) as {
    on: { schedule: Array<{ cron: string }> };
    jobs: { smoke: { steps: Step[] } };
  };
}

function smokeSteps(): Step[] {
  return workflow().jobs.smoke.steps;
}

function freshnessScript(): string {
  const step = smokeSteps().find((s) => s.id === "freshness");
  if (!step?.run) throw new Error("freshness step not found in smoke-prod.yml");
  // The subshell yields the status without terminating the script, which is
  // how the real `node …` invocation behaves.
  return step.run.replace(
    "node scripts/run-smoke.mjs https://restoreassist.app --preflight-only",
    '( exit "$FAKE_EXIT" )',
  );
}

interface RunResult {
  code: number;
  stdout: string;
  outputs: string;
}

/** Execute the shipped step script with a stubbed preflight exit code. */
function runFreshness(preflightExit: number, staleFails: boolean): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "smoke-freshness-"));
  const script = join(dir, "freshness.sh");
  const ghOutput = join(dir, "github_output");
  writeFileSync(script, freshnessScript());
  writeFileSync(ghOutput, "");

  try {
    const stdout = execFileSync("bash", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FAKE_EXIT: String(preflightExit),
        STALE_FAILS_THE_RUN: String(staleFails),
        GITHUB_OUTPUT: ghOutput,
      },
    });
    return { code: 0, stdout, outputs: readFileSync(ghOutput, "utf8") };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? -1,
      stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`,
      outputs: readFileSync(ghOutput, "utf8"),
    };
  }
}

describe("smoke-prod freshness step", () => {
  it("passes when production is serving this revision", () => {
    const r = runFreshness(0, false);
    expect(r.code).toBe(0);
    expect(r.outputs).toContain("stale=false");
  });

  // The whole point: on the fifteen-minute watch, an unpromoted production is
  // a release problem to report, not ninety-six failure emails a day.
  it("warns but does not fail the fifteen-minute watch when stale", () => {
    const r = runFreshness(3, false);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("::warning::");
    expect(r.stdout).not.toContain("::error::");
    expect(r.outputs).toContain("stale=true");
  });

  it("fails once a day, and on demand, when stale", () => {
    const r = runFreshness(3, true);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("::error::");
  });

  // Exit 4 is "the deployment will not say which build it is" -- the question
  // could not be ANSWERED, as opposed to stale, which is an answer. It gets the
  // same shape as staleness (warn on the watch, fail on the daily run) because
  // the app DID answer /api/health normally, so it is not an availability
  // failure and must not drown out the outage alarm; but a freshness check that
  // can never fail is not a check, and on DigitalOcean this is the permanent
  // state until GIT_SHA is set in the app spec.
  //
  // This deliberately WIDENS what the watch tolerates, from one code to two.
  // Recorded rather than glossed: the pair below is the whole of the widening,
  // and 1, 2 and 127 remain immediate failures at every schedule.
  it("warns but does not fail the fifteen-minute watch when the build is unverifiable", () => {
    const r = runFreshness(4, false);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("::warning::");
    expect(r.stdout).not.toContain("::error::");
    expect(r.outputs).toContain("stale=unverifiable");
  });

  it("fails once a day, and on demand, when the build is unverifiable", () => {
    const r = runFreshness(4, true);
    expect(r.code).toBe(4);
    expect(r.stdout).toContain("::error::");
    expect(r.stdout).toContain("GIT_SHA");
  });

  // Tolerating exit 3 and 4 must never widen into tolerating a broken production.
  it.each([1, 2, 127])(
    "still fails immediately on preflight exit %i, which is not staleness",
    (code) => {
      for (const staleFails of [true, false]) {
        const r = runFreshness(code, staleFails);
        expect(r.code).toBe(code);
        expect(r.stdout).toContain("::error::");
        expect(r.stdout).toContain("not staleness");
      }
    },
  );
});

describe("smoke-prod workflow wiring", () => {
  it("keeps the outage watch and adds a separate daily staleness run", () => {
    const crons = workflow().on.schedule.map((s) => s.cron);
    expect(crons).toContain(WATCH_CRON);
    expect(crons).toContain(STALENESS_CRON);
  });

  it("fails on staleness only for the daily schedule and manual runs", () => {
    const step = smokeSteps().find((s) => s.id === "freshness");
    const expr = String(step?.env?.STALE_FAILS_THE_RUN ?? "");
    expect(expr).toContain("workflow_dispatch");
    expect(expr).toContain(STALENESS_CRON);
    // The watch cron must NOT appear, or every run fails again.
    expect(expr).not.toContain(WATCH_CRON);
  });

  // The regression that mattered most: the flow smoke was being skipped.
  it("still runs the user-flow smoke after the freshness step", () => {
    const steps = smokeSteps();
    const freshnessIdx = steps.findIndex((s) => s.id === "freshness");
    const smokeIdx = steps.findIndex((s) =>
      s.name?.includes("Run origin-bound production smoke"),
    );
    expect(freshnessIdx).toBeGreaterThanOrEqual(0);
    expect(smokeIdx).toBeGreaterThan(freshnessIdx);
    // No `if:` guard that would skip it while production is stale.
    expect(steps[smokeIdx].if).toBeUndefined();
  });
});
