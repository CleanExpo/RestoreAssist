import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The production release path, enforced.
 *
 * These invariants already existed in
 * scripts/ci/__tests__/production-deployment-blocked.test.mjs -- and none of
 * them ran. config/vitest.config.js includes only `**âˆ•*.test.ts`, so every
 * guard that file asserts has been unenforced: that the build job never sees
 * production credentials, that the attestation action is SHA-pinned, that
 * preflight, migration parity, activation and rollback are all wired in order.
 *
 * That mattered the moment the deploy stopped being permanently blocked. The
 * block was a single unconditional `exit 1` doing the work of every other
 * guard; with it relaxed, the other guards are what remains, so something has
 * to check they are still there.
 */

const ROOT = process.cwd();
const DEPLOY = join(ROOT, ".github", "workflows", "deploy-production.yml");

const source = () => readFileSync(DEPLOY, "utf8");

interface Step {
  name?: string;
  run?: string;
  if?: string;
  uses?: string;
}

function deployJobSteps(): Step[] {
  const parsed = parse(source()) as {
    jobs: { deploy: { steps: Step[] } };
  };
  return parsed.jobs.deploy.steps;
}

function stepIndex(fragment: string): number {
  return deployJobSteps().findIndex((s) => (s.name ?? "").includes(fragment));
}

describe("activation is no longer unconditionally blocked", () => {
  // The defect: step 3 of 16 was `exit 1` with no `if:`, ahead of everything
  // that acts. The workflow could not deploy at all, whatever else was green.
  it("has no step that exits non-zero unconditionally", () => {
    const blocking = deployJobSteps().filter(
      (s) => s.if === undefined && /^\s*exit\s+[1-9]/m.test(s.run ?? ""),
    );
    expect(blocking.map((s) => s.name)).toEqual([]);
  });

  it("records the accepted runner-loss risk rather than hiding it", () => {
    const step = deployJobSteps().find((s) =>
      /runner-loss|runner loss/i.test(`${s.name ?? ""}${s.run ?? ""}`),
    );
    expect(step, "the accepted risk must still be stated somewhere").toBeDefined();
    expect(step?.run).toContain("::warning");
    expect(step?.run).toContain("GITHUB_STEP_SUMMARY");
  });

  it("no longer calls itself BLOCKED", () => {
    const parsed = parse(source()) as { name: string };
    expect(parsed.name).not.toContain("BLOCKED");
  });
});

describe("every other guard is still present and ordered", () => {
  // Ported from the never-executed .mjs. Each of these is a real control:
  // remove one and a bad image, a schema mismatch or an unrecoverable
  // activation reaches production unnoticed.
  it.each([
    ["release-gate receipt is verified", /verify-release-gate-run\.mjs/],
    ["image is built and pushed", /docker buildx build[\s\S]*--push/],
    ["attestation action is SHA-pinned", /actions\/attest@[0-9a-f]{40}/],
    ["attestation is verified", /gh attestation verify/],
    ["app spec is rendered, not hand-written", /render-production-app-spec\.mjs/],
    ["rollback target is captured first", /digitalocean-production-release\.py preflight/],
    ["migration parity is proven", /verify-production-migrations\.sh/],
    ["activation goes through the release script", /digitalocean-production-release\.py deploy/],
    ["a failed smoke rolls back", /digitalocean-production-release\.py rollback/],
  ])("%s", (_label, pattern) => {
    expect(source()).toMatch(pattern);
  });

  it("captures the rollback target BEFORE activating", () => {
    const capture = stepIndex("rollback target");
    const activate = stepIndex("Activate exact deployment");
    expect(capture).toBeGreaterThanOrEqual(0);
    expect(activate).toBeGreaterThan(capture);
  });

  it("smokes production after activation, and rolls back if that fails", () => {
    const activate = stepIndex("Activate exact deployment");
    const smoke = stepIndex("user-flow smoke");
    expect(smoke).toBeGreaterThan(activate);
    const rollback = deployJobSteps().find((s) =>
      (s.name ?? "").includes("Roll back after user-flow smoke failure"),
    );
    expect(rollback?.if).toContain("failure");
  });

  // The security invariant with the worst blast radius: the build job runs
  // untrusted-ish build tooling and must never hold production credentials.
  it("never exposes production credentials to the build job", () => {
    const text = source();
    const buildJob = text.slice(
      text.indexOf("  build:"),
      text.indexOf("  reject-non-main:"),
    );
    expect(buildJob).not.toMatch(
      /DIGITALOCEAN_ACCESS_TOKEN|DIGITALOCEAN_APP_ID|PRODUCTION_DIRECT_URL/,
    );
    // Guard the guard: an empty slice would pass vacuously.
    expect(buildJob.length).toBeGreaterThan(500);
  });

  it("keeps the dispatch confirmations that bind a deploy to one revision", () => {
    const parsed = parse(source()) as {
      on: { workflow_dispatch: { inputs: Record<string, { required?: boolean }> } };
      jobs: { deploy: { environment?: { name?: string }; needs?: unknown } };
    };
    const inputs = parsed.on.workflow_dispatch.inputs;
    expect(inputs.confirm_sha.required).toBe(true);
    expect(inputs.release_gate_run_id.required).toBe(true);
    expect(parsed.jobs.deploy.environment?.name).toBe("production");
    expect(parsed.jobs.deploy.needs).toBe("build");
  });
});

describe("the App Platform health check is a readiness probe", () => {
  /**
   * Production served a build older than the `deploymentSha` field for weeks
   * while every image build went green. The spec named only `http_path`, and
   * pointed it at `/api/health/migrations` -- a migration-drift watchdog whose
   * own docstring calls it a probe for "UptimeRobot, manual probe".
   *
   * Two failures in one line. It answers the wrong question: a container can
   * serve traffic perfectly while the database ledger has drift, and that
   * endpoint returns 503 on any drift and 504 when slow -- so App Platform
   * fails the deployment and rolls back. And it deadlocks, because the deploy
   * that would FIX the drift can never go green while the drift exists.
   *
   * Omitting the timings is the other half: App Platform then applies its
   * defaults -- a 1-second timeout with no startup grace -- against an endpoint
   * that opens a database connection, on a basic-xxs instance.
   *
   * These assertions live HERE rather than in
   * scripts/ci/__tests__/production-deployment-blocked.test.mjs because that
   * file is a .test.mjs and config/vitest.config.js never runs it. A guard on
   * the production release path that CI does not execute is the thing this
   * whole file exists to correct.
   */
  const spec = () =>
    parse(readFileSync(join(ROOT, ".do", "app.yaml"), "utf8")) as {
      services: Array<{
        health_check?: Record<string, unknown>;
      }>;
    };

  it("probes readiness, not migration drift", () => {
    expect(spec().services[0].health_check?.http_path).toBe("/api/health");
  });

  it("never points the probe back at the drift watchdog", () => {
    // Stated separately from the assertion above so the reason survives: this
    // is the exact value that blocked every deploy.
    expect(spec().services[0].health_check?.http_path).not.toBe(
      "/api/health/migrations",
    );
  });

  it("sets its own timings rather than inheriting a one-second default", () => {
    const health = spec().services[0].health_check ?? {};
    expect(health.initial_delay_seconds).toBeGreaterThanOrEqual(30);
    expect(health.timeout_seconds).toBeGreaterThanOrEqual(5);
    expect(health.failure_threshold).toBeGreaterThanOrEqual(3);
    expect(health.period_seconds).toBeGreaterThanOrEqual(5);
  });
});
