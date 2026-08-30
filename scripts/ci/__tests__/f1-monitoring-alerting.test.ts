import { describe, expect, it } from "vitest";

import {
  F1_PRODUCTION_CHECKS,
  F1_REQUIRED_CLASSES,
  declaredNotifierLabels,
  summariseF1,
  type WorkflowRun,
} from "../producers/f1-monitoring-alerting";

/**
 * F1 producer unit tests.
 *
 * The failure this criterion exists to prevent is a check that reports silence
 * while watching nothing, and an alarm that cannot ring. Both look identical to
 * a healthy system in review, so each is tested by planting exactly one lie.
 */

const NOW = new Date("2026-08-30T23:05:00Z");

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    status: "completed",
    conclusion: "success",
    created_at: "2026-08-30T23:00:00Z",
    event: "schedule",
    ...overrides,
  };
}

const CHECKS = [
  { workflow: "smoke-prod.yml", maxAgeHours: 2 },
  { workflow: "pilot-canary.yml", maxAgeHours: 48 },
] as const;

function healthyRuns(): Map<string, WorkflowRun | undefined> {
  return new Map(CHECKS.map((c) => [c.workflow, run()]));
}

function summarise(over: Partial<Parameters<typeof summariseF1>[0]> = {}) {
  return summariseF1({
    runs: healthyRuns(),
    existingLabels: new Set(["security"]),
    declaredLabels: ["security"],
    now: NOW,
    checks: CHECKS,
    coverage: Object.fromEntries(F1_REQUIRED_CLASSES.map((c) => [c, "an-alert"])),
    ...over,
  });
}

describe("monitoring that runs and is green", () => {
  it("reports fully healthy monitoring when every check is green and fresh", () => {
    const m = summarise();
    expect(m.checksDeclared).toBe(2);
    expect(m.checksHealthy).toBe(2);
    expect(m.failingChecks).toBe("");
    expect(m.staleChecks).toBe("");
  });

  it("counts a failing check as unhealthy and names it", () => {
    const runs = healthyRuns();
    runs.set("smoke-prod.yml", run({ conclusion: "failure" }));
    const m = summarise({ runs });
    expect(m.checksHealthy).toBe(1);
    expect(m.failingChecks).toBe("smoke-prod.yml");
  });

  it("counts a check that stopped firing as stale, not as passing", () => {
    /**
     * The eight-week failure, in its first half. The Supabase advisor gate had
     * not looked at prod since 2026-06-22. A check that stopped running reports
     * exactly what a healthy system reports: nothing.
     */
    const runs = healthyRuns();
    runs.set("smoke-prod.yml", run({ created_at: "2026-08-30T18:00:00Z" }));
    const m = summarise({ runs });
    expect(m.staleChecks).toBe("smoke-prod.yml");
    expect(m.checksHealthy).toBe(1);
  });

  it("treats a check that has never run as stale rather than absent", () => {
    const runs = healthyRuns();
    runs.set("pilot-canary.yml", undefined);
    const m = summarise({ runs });
    expect(m.staleChecks).toBe("pilot-canary.yml");
    expect(m.checksHealthy).toBe(1);
  });

  it("does not double-count a check that is both failing and stale", () => {
    // Otherwise checksHealthy could go negative and a second fault would look
    // like a different, worse kind of failure than it is.
    const runs = healthyRuns();
    runs.set("smoke-prod.yml", run({ conclusion: "failure", created_at: "2026-08-01T00:00:00Z" }));
    const m = summarise({ runs });
    expect(m.checksHealthy).toBe(1);
    expect(m.failingChecks).toBe("smoke-prod.yml");
    expect(m.staleChecks).toBe("smoke-prod.yml");
  });

  it("reproduces the live production picture measured on 2026-08-30", () => {
    // Real observations from the GitHub API, kept as a regression fixture: one
    // of four checks healthy, three red, and the security label absent.
    const runs = new Map<string, WorkflowRun | undefined>([
      ["smoke-prod.yml", run({ conclusion: "failure", created_at: "2026-08-30T23:01:18Z" })],
      ["pilot-canary.yml", run({ created_at: "2026-08-30T16:07:57Z" })],
      ["supabase-advisor-gate.yml", run({ conclusion: "failure", created_at: "2026-08-24T13:18:28Z" })],
      ["deepsec-weekly.yml", run({ conclusion: "failure", created_at: "2026-08-24T13:22:34Z" })],
    ]);
    const m = summariseF1({
      runs,
      existingLabels: new Set(["bug", "enhancement"]),
      declaredLabels: ["security"],
      now: NOW,
      checks: F1_PRODUCTION_CHECKS,
    });
    expect(m.checksHealthy).toBe(1);
    expect(m.failingChecks).toBe(
      "deepsec-weekly.yml,smoke-prod.yml,supabase-advisor-gate.yml",
    );
    expect(m.missingNotifierLabels).toBe("security");
  });
});

describe("alarms that can actually fire", () => {
  it("names a notifier label that does not exist", () => {
    /**
     * The eight-week failure, in its second half, and the reason those weeks
     * produced ZERO notifications. `gh issue create` rejects a non-existent
     * label, so the notifier step fails and no issue is ever filed -- an alarm
     * wired to a bell that was never installed.
     */
    const m = summarise({ existingLabels: new Set(["bug"]) });
    expect(m.missingNotifierLabels).toBe("security");
  });

  it("passes the label half only when every declared label resolves", () => {
    expect(summarise().missingNotifierLabels).toBe("");
  });

  it("parses labels only from gh issue create invocations", () => {
    const source = [
      "      - name: Open issue on failure",
      "        run: |",
      '          gh issue create --title "x" --label "security" --body "y"',
      "      - name: Something else",
      '        run: gh pr edit --label "not-an-alarm"',
    ].join("\n");
    // A --label on a later step is not an alarm, and must not be read as one.
    expect(declaredNotifierLabels([source])).toEqual(["security"]);
  });

  it("collects labels across several notifiers without duplicating them", () => {
    const a = 'gh issue create --label "security" --label "risk:critical"';
    const b = 'gh issue create --label "security"';
    expect(declaredNotifierLabels([a, b])).toEqual(["risk:critical", "security"]);
  });

  it("reports no declared labels when a notifier uses none", () => {
    // deepsec-weekly.yml is exactly this shape. Reported honestly here; the
    // verifier is what refuses to let an empty set pass as "alerting".
    expect(declaredNotifierLabels(['gh issue create --title "x" --body "y"'])).toEqual([]);
  });
});

describe("coverage of the three failure classes the criterion names", () => {
  it("ships with an empty coverage map, so F1 cannot pass by default", () => {
    /**
     * The signals exist in code and nothing watches them -- SecurityEvent rows,
     * StripeWebhookEvent FAILED, StorageRestoreJob failures. Filling this map
     * is an owner action, because it means choosing where alerts live now that
     * production is DigitalOcean rather than Vercel. Empty is the honest state,
     * the same as A3_EXPECTED_VIEWER_ID.
     */
    const m = summariseF1({
      runs: healthyRuns(),
      existingLabels: new Set(["security"]),
      declaredLabels: ["security"],
      now: NOW,
      checks: CHECKS,
    });
    expect(m.coveredClasses).toBe("");
    expect(m.uncoveredClasses).toBe(
      "auth-failures,billing-webhook-errors,restore-job-failures",
    );
  });

  it("names exactly the classes still unwatched", () => {
    const m = summarise({ coverage: { "auth-failures": "an-alert" } });
    expect(m.coveredClasses).toBe("auth-failures");
    expect(m.uncoveredClasses).toBe("billing-webhook-errors,restore-job-failures");
  });

  it("reports every class covered only when all three are", () => {
    expect(summarise().uncoveredClasses).toBe("");
    expect(summarise().coveredClasses).toBe(summarise().requiredClasses);
  });
});
