import { describe, expect, it } from "vitest";
import {
  buildPilotCommandCentre,
  buildPilotDeploymentSource,
  type PilotWorkflowId,
  type PilotWorkflowRun,
} from "@/lib/pilot-readiness-command-centre";

const NOW = new Date("2026-07-12T00:00:00.000Z");

const DEPLOYMENT = {
  environment: "production",
  branch: "main",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  commitUrl:
    "https://github.com/CleanExpo/RestoreAssist/commit/0123456789abcdef0123456789abcdef01234567",
  deploymentUrl: "https://restoreassist.app",
};

function workflowRun(
  workflowId: PilotWorkflowId,
  overrides: Partial<PilotWorkflowRun> = {},
): PilotWorkflowRun {
  return {
    id: 100,
    workflowId,
    workflowName: workflowId,
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    headBranch: "main",
    headSha: DEPLOYMENT.commitSha,
    updatedAt: "2026-07-11T23:30:00.000Z",
    url: `https://github.com/CleanExpo/RestoreAssist/actions/runs/${workflowId}`,
    ...overrides,
  };
}

function successfulRuns(): Partial<Record<PilotWorkflowId, PilotWorkflowRun>> {
  return {
    "pr-checks.yml": workflowRun("pr-checks.yml"),
    "route-safety.yml": workflowRun("route-safety.yml"),
    "smoke-prod.yml": workflowRun("smoke-prod.yml", {
      updatedAt: "2026-07-11T23:40:00.000Z",
      event: "schedule",
    }),
    "supabase-advisor-gate.yml": workflowRun(
      "supabase-advisor-gate.yml",
      { updatedAt: "2026-07-10T00:00:00.000Z", event: "schedule" },
    ),
    "pilot-canary.yml": workflowRun("pilot-canary.yml", {
      updatedAt: "2026-07-11T10:00:00.000Z",
      event: "schedule",
    }),
    "release-gate.yml": workflowRun("release-gate.yml", {
      updatedAt: "2026-07-10T12:00:00.000Z",
    }),
  };
}

function buildGreenSnapshot() {
  return buildPilotCommandCentre({
    now: NOW,
    deployment: DEPLOYMENT,
    workflowRuns: successfulRuns(),
    pilotCanaryJobs: [
      { name: "secrets-gate", status: "completed", conclusion: "success" },
      { name: "swarm", status: "completed", conclusion: "success" },
    ],
    rlsCoverage: { total: 203, enabled: 203 },
  });
}

describe("buildPilotCommandCentre", () => {
  it("returns GO only when every blocking gate has fresh passing evidence", () => {
    const snapshot = buildGreenSnapshot();

    expect(snapshot.decision).toBe("GO");
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.gates).toHaveLength(7);
    expect(snapshot.gates.every((gate) => gate.status === "pass")).toBe(true);
    expect(snapshot.counts).toEqual({
      verified: 7,
      needsEvidence: 0,
      blockers: 0,
    });
  });

  it("fails closed when the production smoke evidence is stale", () => {
    const runs = successfulRuns();
    runs["smoke-prod.yml"] = workflowRun("smoke-prod.yml", {
      updatedAt: "2026-07-11T23:14:00.000Z",
      event: "schedule",
    });

    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      workflowRuns: runs,
      pilotCanaryJobs: [
        { name: "swarm", status: "completed", conclusion: "success" },
      ],
      rlsCoverage: { total: 203, enabled: 203 },
    });

    const smoke = snapshot.gates.find(
      (gate) => gate.id === "production-smoke",
    );
    expect(smoke).toMatchObject({ status: "unknown", blocking: true });
    expect(smoke?.summary).toMatch(/stale/i);
    expect(snapshot.decision).toBe("NO_GO");
    expect(snapshot.blockers.map((gate) => gate.id)).toContain(
      "production-smoke",
    );
  });

  it("surfaces a failed security-advisor run even when live RLS coverage is complete", () => {
    const runs = successfulRuns();
    runs["supabase-advisor-gate.yml"] = workflowRun(
      "supabase-advisor-gate.yml",
      {
        conclusion: "failure",
        updatedAt: "2026-07-11T12:00:00.000Z",
        event: "schedule",
      },
    );

    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      workflowRuns: runs,
      pilotCanaryJobs: [
        { name: "swarm", status: "completed", conclusion: "success" },
      ],
      rlsCoverage: { total: 203, enabled: 203 },
    });

    const security = snapshot.gates.find(
      (gate) => gate.id === "rls-advisors",
    );
    expect(security).toMatchObject({ status: "fail", blocking: true });
    expect(security?.summary).toContain("203/203");
    expect(security?.summary).toMatch(/failed/i);
    expect(snapshot.decision).toBe("NO_GO");
  });

  it("does not treat a successful canary workflow with a skipped swarm as evidence", () => {
    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      workflowRuns: successfulRuns(),
      pilotCanaryJobs: [
        { name: "secrets-gate", status: "completed", conclusion: "success" },
        { name: "swarm", status: "completed", conclusion: "skipped" },
      ],
      rlsCoverage: { total: 203, enabled: 203 },
    });

    const canary = snapshot.gates.find((gate) => gate.id === "pilot-canary");
    expect(canary).toMatchObject({ status: "unknown", blocking: true });
    expect(canary?.summary).toMatch(/swarm.*skipped/i);
    expect(canary?.nextAction).toMatch(/secrets|rerun/i);
    expect(snapshot.decision).toBe("NO_GO");
  });

  it("marks an in-progress workflow as warning and keeps it blocking", () => {
    const runs = successfulRuns();
    runs["route-safety.yml"] = workflowRun("route-safety.yml", {
      status: "in_progress",
      conclusion: null,
    });

    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      workflowRuns: runs,
      pilotCanaryJobs: [
        { name: "swarm", status: "completed", conclusion: "success" },
      ],
      rlsCoverage: { total: 203, enabled: 203 },
    });

    expect(
      snapshot.gates.find((gate) => gate.id === "route-safety"),
    ).toMatchObject({ status: "warning", blocking: true });
    expect(snapshot.decision).toBe("NO_GO");
  });

  it("rejects code-quality evidence from a source other than the deployed commit or merged PR head", () => {
    const runs = successfulRuns();
    runs["pr-checks.yml"] = workflowRun("pr-checks.yml", {
      headSha: "ffffffffffffffffffffffffffffffffffffffff",
    });
    runs["route-safety.yml"] = workflowRun("route-safety.yml", {
      headSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });

    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      verifiedSourceShas: [
        DEPLOYMENT.commitSha,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ],
      workflowRuns: runs,
      pilotCanaryJobs: [
        { name: "swarm", status: "completed", conclusion: "success" },
      ],
      rlsCoverage: { total: 203, enabled: 203 },
    });

    expect(snapshot.gates.find((gate) => gate.id === "type-check")).toMatchObject(
      { status: "unknown", blocking: true },
    );
    expect(snapshot.gates.find((gate) => gate.id === "ai-audit")).toMatchObject(
      { status: "unknown", blocking: true },
    );
    expect(
      snapshot.gates.find((gate) => gate.id === "route-safety"),
    ).toMatchObject({ status: "unknown", blocking: true });
    expect(snapshot.blockers.map((gate) => gate.id)).toEqual(
      expect.arrayContaining(["type-check", "ai-audit", "route-safety"]),
    );
    expect(snapshot.decision).toBe("NO_GO");
  });

  it("returns named actions instead of fabricated passes when every source is unavailable", () => {
    const snapshot = buildPilotCommandCentre({
      now: NOW,
      deployment: DEPLOYMENT,
      workflowRuns: {},
      pilotCanaryJobs: null,
      rlsCoverage: null,
    });

    expect(snapshot.decision).toBe("NO_GO");
    expect(snapshot.counts).toEqual({
      verified: 0,
      needsEvidence: 7,
      blockers: 7,
    });
    expect(snapshot.gates.every((gate) => gate.status === "unknown")).toBe(
      true,
    );
    expect(
      snapshot.gates.every(
        (gate) =>
          gate.owner.length > 0 &&
          gate.nextAction.length > 0 &&
          gate.sourceUrl.startsWith("https://github.com/CleanExpo/RestoreAssist"),
      ),
    ).toBe(true);
  });
});

describe("buildPilotDeploymentSource", () => {
  it("projects only safe Vercel deployment metadata", () => {
    const deployment = buildPilotDeploymentSource({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: DEPLOYMENT.commitSha,
      VERCEL_PROJECT_PRODUCTION_URL: "restoreassist.app",
      DATABASE_URL: "postgresql://must-not-leak",
    });

    expect(deployment).toEqual(DEPLOYMENT);
    expect(JSON.stringify(deployment)).not.toContain("must-not-leak");
  });

  it("uses explicit unknown values when deployment metadata is absent", () => {
    expect(buildPilotDeploymentSource({ NODE_ENV: "development" })).toEqual({
      environment: "development",
      branch: null,
      commitSha: null,
      commitUrl: null,
      deploymentUrl: null,
    });
  });
});
