import { describe, it, expect } from "vitest";
import { classifyWorkItem } from "../classifier";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-0000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("classifyWorkItem", () => {
  it("classifies a design-system issue as design via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7001",
        title: "Dashboard cards use inconsistent border radius",
        description:
          "The job-card, invoice-card, and inspection-card components in components/dashboard/ " +
          "use three different border-radius values. Align them to the design-system tokens.",
        labels: ["design", "ui"],
      }),
    );
    expect(result.bucket).toBe("design");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("design");
  });

  it("classifies a marketing-copywriter issue as marketing via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7002",
        title: "Rewrite the cost-calculator landing page hero copy",
        description:
          "The hero section on /cost-calculator undersells the GST-inclusive quoting benefit. " +
          "Needs a copywriter pass aligned to the 30-in-30 campaign funnel messaging.",
        labels: ["marketing", "content"],
      }),
    );
    expect(result.bucket).toBe("marketing");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("marketing");
  });

  it("classifies a security-audit issue as security via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7003",
        title: "Audit service-role Supabase key usage in lib/integrations",
        description:
          "Confirm no API route uses the Supabase service-role key without an explicit " +
          "workspace-scoped RLS check. Follows the 2026-05-18 service-role audit finding.",
        labels: ["security"],
      }),
    );
    expect(result.bucket).toBe("security");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("security");
  });

  it("classifies a plain bug report via free-text keywords when no bucket label exists", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7004",
        title: "Equipment calculator throws on zero-affected-area storm jobs",
        description:
          "Reported by a technician: submitting a storm-damage scope with 0m² affected area " +
          "crashes lib/equipment-calculator-storm.ts with a divide-by-zero. Should show a validation error instead.",
        labels: ["bug"],
      }),
    );
    expect(result.bucket).toBe("bug");
    expect(result.confidence).toBe("label");
  });

  it("classifies an infra issue as infra via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7005",
        title: "Vercel preview deploys are failing on the sandbox branch",
        description:
          "Last 3 sandbox deploys failed at the build step with an out-of-memory error. " +
          "Needs a Vercel build config / Railway resource review.",
        labels: ["infra", "deployment"],
      }),
    );
    expect(result.bucket).toBe("infra");
    expect(result.confidence).toBe("label");
  });

  it("classifies a video-series issue as video via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7006",
        title: "Record the onboarding-welcome walkthrough video",
        description:
          "Part of the RestoreAssist onboarding video series — script, narrate, render, caption, " +
          "and wire into <VideoExplainer> per the orchestrating-restoreassist-video-series skill.",
        labels: ["video"],
      }),
    );
    expect(result.bucket).toBe("video");
    expect(result.confidence).toBe("label");
  });

  it("classifies a feature request as feature via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7007",
        title: "Add bulk CSV export for inspection reports",
        description:
          "Technicians want to export a batch of closed inspections to CSV for their own records.",
        labels: ["feature"],
      }),
    );
    expect(result.bucket).toBe("feature");
    expect(result.confidence).toBe("label");
  });

  it("classifies a copy issue as copy via label even when 'content' label is also present", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7008",
        title: "Tighten the trial-expiry email subject lines",
        description: "Subject lines are 90+ characters and get truncated in Gmail's inbox preview.",
        labels: ["copy", "content"],
      }),
    );
    expect(result.bucket).toBe("copy");
    expect(result.confidence).toBe("label");
  });

  it("falls back to free-text classification when no label matches a bucket", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7009",
        title: "XSS risk in claim-notes rich text renderer",
        description:
          "User-supplied claim notes are rendered without escapeHtml() in components/claims/NotesPanel.tsx — " +
          "a stored XSS vector.",
        labels: ["needs-triage"],
      }),
    );
    expect(result.bucket).toBe("security");
    expect(result.confidence).toBe("text");
    expect(result.matchedSignals).toContain("xss");
  });

  it("defaults to feature when neither labels nor text match any bucket", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7010",
        title: "Investigate technician onboarding drop-off",
        description: "Support has flagged that ~15% of invited technicians never complete onboarding.",
        labels: [],
      }),
    );
    expect(result.bucket).toBe("feature");
    expect(result.confidence).toBe("text");
  });
});
