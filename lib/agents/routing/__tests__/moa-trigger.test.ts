import { describe, it, expect } from "vitest";
import { shouldFanOut } from "../moa-trigger";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-8000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("shouldFanOut", () => {
  it("fans out when the decision is architecture-level with multiple viable approaches", () => {
    const decision = shouldFanOut({
      bucket: "infra",
      routedSkills: [{ skill: "use-railway", role: "primary" }],
      issue: issue({
        title: "Choose between Railway multi-region and Vercel Edge for report-render latency",
        description:
          "Two materially different long-term architectures on the table: keep rendering on " +
          "Railway with regional replicas, or move render workers to Vercel Edge Functions.",
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("architecture-level-multi-approach");
  });

  it("fans out when the action is hard-to-reverse (schema migration)", () => {
    const decision = shouldFanOut({
      bucket: "bug",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Backfill and rename the InspectionReport.status column",
        description: "Requires a two-step Prisma migration against the production database.",
        labels: ["bug", "migration"],
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("hard-to-reverse");
  });

  it("fans out when a judge/go-no-go gate is present", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Ship the tenant-DB pilot cutover",
        description: "Needs a /judge go/no-go review before the cutover phase proceeds.",
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("judge-gate-present");
  });

  it("fans out when the work item is ambiguous with open spec questions", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Improve technician onboarding completion",
        description: "Vague — no acceptance criteria specified yet.",
      }),
      hasOpenSpecQuestions: true,
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("ambiguous-spec");
  });

  it("fans out when the work is cross-cutting across 3+ routing buckets", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Relaunch the pricing page",
        description: "Touches design, copy, and marketing simultaneously.",
      }),
      crossCuttingBuckets: ["design", "copy", "marketing"],
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("cross-cutting-3-plus-buckets");
  });

  it("does not fan out when none of the 5 triggers apply", () => {
    const decision = shouldFanOut({
      bucket: "bug",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
        description: "Simple arithmetic fix in lib/equipment-calculator-mould.ts, single approach, fully reversible.",
        labels: ["bug"],
      }),
    });
    expect(decision.fanOut).toBe(false);
    expect(decision.reasons).toHaveLength(0);
  });

  it("reports multiple matched reasons when more than one trigger applies", () => {
    const decision = shouldFanOut({
      bucket: "security",
      routedSkills: [{ skill: "security-audit", role: "primary" }],
      issue: issue({
        title: "Rotate and re-scope the Supabase service-role key strategy",
        description:
          "Hard-to-reverse security posture change; two competing approaches (per-workspace keys " +
          "vs a single scoped proxy) with materially different long-term cost. Needs a go/no-go gate.",
        labels: ["security"],
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
