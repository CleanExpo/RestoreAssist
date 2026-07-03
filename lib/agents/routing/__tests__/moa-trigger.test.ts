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

  // --- Heuristic-quality regression tests (criteria 1-3 detection) ---

  describe("false positives — incidental keyword mentions", () => {
    it("does not fan out for a docs-only issue that merely mentions a schema diagram and migration guide", () => {
      const decision = shouldFanOut({
        bucket: "feature",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Add a schema diagram to the developer README",
          description:
            "Documentation-only: embed an ER schema diagram and link the existing migration guide page. " +
            "No code or database changes.",
          labels: ["docs"],
        }),
      });
      expect(decision.fanOut).toBe(false);
      expect(decision.reasons).not.toContain("hard-to-reverse");
    });

    it("does not treat a keyword embedded in a larger word as a match (word boundary)", () => {
      // "public api" is a substring of "public apiary" — naive includes() would
      // have matched; the word-boundary matcher must not.
      const decision = shouldFanOut({
        bucket: "feature",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Blog post: we keep a public apiary on the office roof",
          description: "Marketing copy about the office bees. Fully reversible content edit.",
          labels: ["copy"],
        }),
      });
      expect(decision.fanOut).toBe(false);
      expect(decision.reasons).not.toContain("hard-to-reverse");
    });
  });

  describe("false negatives — hard-to-reverse phrased without legacy keywords", () => {
    it("fans out for an irreversible feature-flag flip with no schema/migration keyword", () => {
      const decision = shouldFanOut({
        bucket: "infra",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Flip the production feature flag permanently for all tenants",
          description: "One-way door: once enabled it cannot be rolled back for existing workspaces.",
          labels: ["infra"],
        }),
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("hard-to-reverse");
    });

    it("fans out on an irreversible data-loss description", () => {
      const decision = shouldFanOut({
        bucket: "bug",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Purge orphaned inspection attachments",
          description: "Irreversible: this permanently deletes blobs and risks data loss if scoped wrong.",
        }),
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("hard-to-reverse");
    });
  });

  describe("structured label signals (criteria 1-3)", () => {
    it("fans out on a deliberate hard-to-reverse label even when the prose is sparse", () => {
      const decision = shouldFanOut({
        bucket: "feature",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Update the tenant provisioning flow",
          description: "See linked spec.",
          labels: ["feature", "breaking-change"],
        }),
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("hard-to-reverse");
    });

    it("normalises label casing/spacing when matching (Go / No-Go label)", () => {
      const decision = shouldFanOut({
        bucket: "feature",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Tenant-DB cutover",
          description: "See runbook.",
          labels: ["Go No-Go"],
        }),
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("judge-gate-present");
    });

    it("fans out on an architecture label", () => {
      const decision = shouldFanOut({
        bucket: "infra",
        routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
        issue: issue({
          title: "Evaluate the queueing layer",
          description: "See RFC document.",
          labels: ["architecture"],
        }),
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("architecture-level-multi-approach");
    });
  });

  describe("cross-cutting bucket boundary (criterion 5)", () => {
    it("does NOT fan out at exactly 2 cross-cutting buckets", () => {
      const decision = shouldFanOut({
        bucket: "design",
        routedSkills: [{ skill: "design-audit", role: "primary" }],
        issue: issue({
          title: "Tweak the pricing page hero copy and layout",
          description: "Minor visual and wording polish, single approach, fully reversible.",
          labels: ["design", "copy"],
        }),
        crossCuttingBuckets: ["design", "copy"],
      });
      expect(decision.fanOut).toBe(false);
      expect(decision.reasons).not.toContain("cross-cutting-3-plus-buckets");
    });

    it("DOES fan out at exactly 3 cross-cutting buckets", () => {
      const decision = shouldFanOut({
        bucket: "design",
        routedSkills: [{ skill: "design-audit", role: "primary" }],
        issue: issue({
          title: "Tweak the pricing page hero copy and layout",
          description: "Minor visual and wording polish, single approach, fully reversible.",
          labels: ["design", "copy", "marketing"],
        }),
        crossCuttingBuckets: ["design", "copy", "marketing"],
      });
      expect(decision.fanOut).toBe(true);
      expect(decision.reasons).toContain("cross-cutting-3-plus-buckets");
    });
  });
});
