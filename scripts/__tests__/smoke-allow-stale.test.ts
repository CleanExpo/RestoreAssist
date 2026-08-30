import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import { parseSmokeArgs, SMOKE_FLAGS } from "../ci/smoke-args.mjs";

/**
 * The half-fixed alarm.
 *
 * `smoke-prod-staleness.test.ts` already tells the story: staleness was
 * aborting the job, so the user-flow smoke never ran and a real outage would
 * have looked exactly like the staleness nobody was reading any more. The fix
 * for that made the *freshness* step warn instead of fail on the fifteen-minute
 * watch, and added a test that the smoke step still exists and is ordered after
 * it.
 *
 * But ordering a step after another does not make it run. The smoke step
 * invokes the same `run-smoke.mjs`, which re-probes freshness and exits 3 on
 * staleness regardless of what the step above decided. So the job kept failing
 * every fifteen minutes — 15 consecutive failures across five shas on the
 * morning of 2026-08-30 — and the availability check the watch exists to
 * provide still never ran.
 *
 * The workflow states the intent directly, in a comment above that step:
 *
 *   "Runs even when production is stale. Against a stale build this proves
 *    availability rather than that THIS revision works -- which is exactly
 *    what an outage watch needs, and what the old abort-on-stale behaviour
 *    threw away."
 *
 * The script disagreed with that comment. `--allow-stale` settles it: the
 * freshness step owns the fail-or-warn decision, and the smoke step proves
 * availability either way.
 */

const WORKFLOW = join(process.cwd(), ".github", "workflows", "smoke-prod.yml");

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, unknown>;
  if?: string;
}

function smokeSteps(): Step[] {
  const doc = parse(readFileSync(WORKFLOW, "utf8")) as {
    jobs: { smoke: { steps: Step[] } };
  };
  return doc.jobs.smoke.steps;
}

function flowSmokeStep(): Step {
  const step = smokeSteps().find((s) =>
    s.name?.includes("Run origin-bound production smoke"),
  );
  if (!step) throw new Error("flow smoke step not found in smoke-prod.yml");
  return step;
}

describe("smoke-prod flow step tolerates a stale deployment", () => {
  it("passes --allow-stale, so staleness cannot abort the availability check", () => {
    expect(flowSmokeStep().run).toContain("--allow-stale");
  });

  it("does not also pass --preflight-only, which would skip the flows entirely", () => {
    expect(flowSmokeStep().run).not.toContain("--preflight-only");
  });

  it("leaves the freshness step as the only place staleness decides the verdict", () => {
    const freshness = smokeSteps().find((s) => s.id === "freshness");
    // The freshness step still owns fail-vs-warn via STALE_FAILS_THE_RUN...
    expect(String(freshness?.env?.STALE_FAILS_THE_RUN ?? "")).toContain(
      "workflow_dispatch",
    );
    // ...and it must NOT tolerate staleness itself, or the daily run and a
    // manual dispatch would lose the one signal that says "promote a release".
    expect(freshness?.run).not.toContain("--allow-stale");
  });
});

describe("parseSmokeArgs", () => {
  it("recognises --allow-stale", () => {
    expect(parseSmokeArgs(["--allow-stale"]).allowStale).toBe(true);
  });

  it("defaults to intolerant, so the daily run keeps failing on staleness", () => {
    expect(parseSmokeArgs([]).allowStale).toBe(false);
    expect(parseSmokeArgs(["--project=chromium"]).allowStale).toBe(false);
  });

  it("keeps --preflight-only working independently", () => {
    const both = parseSmokeArgs(["--preflight-only", "--allow-stale"]);
    expect(both.preflightOnly).toBe(true);
    expect(both.allowStale).toBe(true);
  });

  it("never forwards its own flags to Playwright", () => {
    // Playwright rejects unknown options, so a leaked flag turns a wiring
    // mistake into a misleading exit 2.
    const { extraArgs } = parseSmokeArgs([
      "--allow-stale",
      "--no-deps",
      "--preflight-only",
      "--project=chromium",
    ]);
    expect(extraArgs).toEqual(["--no-deps", "--project=chromium"]);
    for (const flag of SMOKE_FLAGS) {
      expect(extraArgs).not.toContain(flag);
    }
  });

  it("tolerates no arguments at all", () => {
    expect(parseSmokeArgs(undefined as unknown as string[])).toEqual({
      preflightOnly: false,
      allowStale: false,
      extraArgs: [],
    });
  });
});
