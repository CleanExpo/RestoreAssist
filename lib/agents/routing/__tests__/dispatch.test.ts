import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { wrapWithNexus, buildSingleAgentDispatch, buildMoaDispatch, defaultTierSelector } from "../dispatch";
import { __resetNexusPromptCacheForTests } from "../nexus-wrap";
import { classifyWorkItem } from "../classifier";
import { routeToSkills } from "../routing-table";
import { shouldFanOut } from "../moa-trigger";
import type { LinearIssueInput } from "../types";

// Hermetic fixture: nexus-wrap.ts resolves NEXUS_PROMPT_PATH from the env
// (falling back to ~/.claude/skills/nexus/... otherwise), so tests must not
// depend on a real file existing on the machine running the suite. We write
// our own minimal fixture and point NEXUS_PROMPT_PATH at it before the first
// call to wrapWithNexus, then reset nexus-wrap's module-level cache so the
// fixture is actually read (the cache only helps after a successful read).
const FIXTURE_MARKER = "## Fixture prompt marker — dispatch.test.ts";
let fixtureDir: string;
let fixturePath: string;
let originalNexusPromptPath: string | undefined;

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "nexus-prompt-fixture-"));
  fixturePath = join(fixtureDir, "NEXUS_PROMPT.md");
  writeFileSync(
    fixturePath,
    `${FIXTURE_MARKER}\n\nTask: {TASK}\n`,
    "utf-8",
  );

  originalNexusPromptPath = process.env.NEXUS_PROMPT_PATH;
  process.env.NEXUS_PROMPT_PATH = fixturePath;
  __resetNexusPromptCacheForTests();
});

afterAll(() => {
  if (originalNexusPromptPath === undefined) {
    delete process.env.NEXUS_PROMPT_PATH;
  } else {
    process.env.NEXUS_PROMPT_PATH = originalNexusPromptPath;
  }
  __resetNexusPromptCacheForTests();
  rmSync(fixtureDir, { recursive: true, force: true });
});

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

  it("preserves the Nexus prompt's body verbatim", () => {
    const wrapped = wrapWithNexus("Some task.");
    expect(wrapped).toContain(FIXTURE_MARKER);
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
    expect(plan.prompt).toContain(FIXTURE_MARKER);
  });
});

describe("buildMoaDispatch", () => {
  it("builds a Nexus-wrapped MOA dispatch plan naming boardroom as the skill", () => {
    const testIssue = issue({
      identifier: "RA-8000",
      title: "Choose between Railway multi-region and Vercel Edge for report-render latency",
      description:
        "Two materially different long-term architectures on the table: keep rendering on " +
        "Railway with regional replicas, or move render workers to Vercel Edge Functions.",
      labels: ["infra"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({ bucket: classification.bucket, routedSkills, issue: testIssue });

    const plan = buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue);

    expect(plan.mode).toBe("moa");
    expect(plan.skill).toBe("boardroom");
    expect(plan.tier).toBe("sonnet-5");
    expect(plan.prompt).not.toContain("{TASK}");
    expect(plan.prompt).toContain("boardroom");
    expect(plan.prompt).toContain("use-railway");
    expect(plan.prompt).toContain("architecture-level-multi-approach");
  });

  it("includes all routed-skill personas in the panel brief for a cross-cutting issue", () => {
    const testIssue = issue({
      identifier: "RA-8001",
      title: "Relaunch the pricing page",
      description: "Touches design, copy, and marketing simultaneously.",
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({
      bucket: classification.bucket,
      routedSkills,
      issue: testIssue,
      crossCuttingBuckets: ["design", "copy", "marketing"],
    });

    const plan = buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue);

    expect(plan.prompt).toContain("cross-cutting-3-plus-buckets");
  });

  it("throws if called with a decision that did not trigger fan-out", () => {
    const testIssue = issue({
      identifier: "RA-8002",
      title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
      description: "Simple arithmetic fix, single approach, fully reversible.",
      labels: ["bug"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({ bucket: classification.bucket, routedSkills, issue: testIssue });

    expect(() =>
      buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue),
    ).toThrow(/fanOut/);
  });
});
