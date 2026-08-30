import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import {
  finalSmokeExitCode,
  parseSmokeArgs,
  SMOKE_FLAGS,
} from "../ci/smoke-args.mjs";

/**
 * The second blind spot, found by fixing the first.
 *
 * #2103 stopped a stale deployment from aborting the outage watch. The very
 * next scheduled run got past staleness and died one step later:
 *
 *   Migration-health preflight failed: Error: HTTP 504 or non-JSON response
 *
 * Twice in ten minutes, on runs 33306216166 (10:19Z) and 33306651348 (10:30Z).
 * `/api/health` answered normally throughout — only the endpoint that queries
 * the database timed out.
 *
 * The flows still did not run, so nobody could say whether sign-in, the
 * dashboard or the portal were affected. During an incident that is the more
 * urgent of the two questions, and aborting threw it away — the same shape of
 * defect as the staleness abort, one step further along.
 *
 * The dangerous fix is the obvious one: make the probe non-fatal. That would
 * report green while production's database path is failing. So the exit is
 * DEFERRED, not cancelled — the flows run, and the run still fails.
 */

const WORKFLOW = join(process.cwd(), ".github", "workflows", "smoke-prod.yml");

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, unknown>;
}

function flowSmokeStep(): Step {
  const doc = parse(readFileSync(WORKFLOW, "utf8")) as {
    jobs: { smoke: { steps: Step[] } };
  };
  const step = doc.jobs.smoke.steps.find((s) =>
    s.name?.includes("Run origin-bound production smoke"),
  );
  if (!step) throw new Error("flow smoke step not found");
  return step;
}

describe("finalSmokeExitCode — a degraded preflight is never green", () => {
  it("fails the run even when every user flow passed", () => {
    // The property that matters most. Passing flows establish the blast
    // radius; they do not excuse a failing migration probe.
    expect(finalSmokeExitCode({ degraded: true, flowStatus: 0 })).toBe(1);
  });

  it("fails the run when the flows also failed", () => {
    expect(finalSmokeExitCode({ degraded: true, flowStatus: 1 })).toBe(1);
  });

  it("passes a clean run through untouched", () => {
    expect(finalSmokeExitCode({ degraded: false, flowStatus: 0 })).toBe(0);
  });

  it("reports a flow failure on a healthy preflight", () => {
    expect(finalSmokeExitCode({ degraded: false, flowStatus: 1 })).toBe(1);
  });

  it("treats a signal-terminated child as failure, not success", () => {
    // status is null when Playwright is killed; `?? 0` here would turn a
    // SIGKILL into a green gate.
    expect(finalSmokeExitCode({ degraded: false, flowStatus: null })).toBe(1);
    expect(finalSmokeExitCode({ degraded: false, flowStatus: undefined })).toBe(
      1,
    );
  });

  it("preserves a non-standard playwright status", () => {
    expect(finalSmokeExitCode({ degraded: false, flowStatus: 2 })).toBe(2);
  });
});

describe("--flows-despite-degraded wiring", () => {
  it("is passed by the flow smoke step", () => {
    expect(flowSmokeStep().run).toContain("--flows-despite-degraded");
  });

  it("is NOT passed by the freshness preflight step", () => {
    const doc = parse(readFileSync(WORKFLOW, "utf8")) as {
      jobs: { smoke: { steps: Step[] } };
    };
    const freshness = doc.jobs.smoke.steps.find((s) => s.id === "freshness");
    // That step exists to answer "is production current?" and must keep
    // failing on a broken migration probe.
    expect(freshness?.run).not.toContain("--flows-despite-degraded");
  });

  it("is parsed and never forwarded to Playwright", () => {
    const parsed = parseSmokeArgs([
      "--allow-stale",
      "--flows-despite-degraded",
      "--no-deps",
    ]);
    expect(parsed.flowsDespiteDegraded).toBe(true);
    expect(parsed.extraArgs).toEqual(["--no-deps"]);
    expect(SMOKE_FLAGS).toContain("--flows-despite-degraded");
  });

  it("defaults to aborting, so nothing else inherits the tolerance", () => {
    expect(parseSmokeArgs([]).flowsDespiteDegraded).toBe(false);
  });
});
