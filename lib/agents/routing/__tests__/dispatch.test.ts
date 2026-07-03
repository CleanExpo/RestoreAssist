import { describe, it, expect } from "vitest";
import { wrapWithNexus, buildSingleAgentDispatch, defaultTierSelector } from "../dispatch";
import { classifyWorkItem } from "../classifier";
import { routeToSkills } from "../routing-table";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-9000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("wrapWithNexus", () => {
  it("replaces the {TASK} placeholder with the given task text and leaves no placeholder behind", () => {
    const wrapped = wrapWithNexus("Fix the equipment calculator divide-by-zero bug in RA-7004.");
    expect(wrapped).not.toContain("{TASK}");
    expect(wrapped).toContain("Fix the equipment calculator divide-by-zero bug in RA-7004.");
  });

  it("preserves the Nexus prompt's Operating identity section verbatim", () => {
    const wrapped = wrapWithNexus("Some task.");
    expect(wrapped).toContain("## Operating identity");
    expect(wrapped).toContain("## Model calibration");
  });
});

describe("defaultTierSelector", () => {
  it("returns sonnet-5 for every context as a placeholder until Plan 4 lands", () => {
    expect(defaultTierSelector({ bucket: "bug", skill: "linear-task-processor", fanOut: false })).toBe(
      "sonnet-5",
    );
    expect(defaultTierSelector({ bucket: "security", skill: "security-audit", fanOut: true })).toBe(
      "sonnet-5",
    );
  });
});

describe("buildSingleAgentDispatch", () => {
  it("builds a Nexus-wrapped single-agent dispatch plan for a bug issue", () => {
    const testIssue = issue({
      identifier: "RA-7004",
      title: "Equipment calculator throws on zero-affected-area storm jobs",
      description:
        "Submitting a storm-damage scope with 0m² affected area crashes " +
        "lib/equipment-calculator-storm.ts with a divide-by-zero.",
      labels: ["bug"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);

    const plan = buildSingleAgentDispatch(classification, routedSkills, defaultTierSelector, testIssue);

    expect(plan.mode).toBe("single-agent");
    expect(plan.skill).toBe("linear-task-processor");
    expect(plan.tier).toBe("sonnet-5");
    expect(plan.prompt).not.toContain("{TASK}");
    expect(plan.prompt).toContain("RA-7004");
    expect(plan.prompt).toContain("## Operating identity");
  });
});
