import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { evaluatePrScope } from "../check-pr-scope.mjs";

const ROOT = process.cwd();

describe("PR quality contract", () => {
  it("rejects PRs that cannot receive the configured external review", () => {
    expect(evaluatePrScope("100")).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(evaluatePrScope("101")).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(evaluatePrScope("unknown")).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  it("uses one exact full-suite command locally and in CI", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["test:unit:full"]).toBe(
      "vitest run --config config/vitest.config.js && npm run test:pilot-harness",
    );
    expect(packageJson.scripts["test:pilot-harness"]).toBe(
      "npm --prefix packages/pilot-tester test",
    );

    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as { jobs: { quality: { steps: Array<{ name?: string; run?: string }> } } };
    const unitStep = workflow.jobs.quality.steps.find(
      (step) => step.name === "Unit tests",
    );
    expect(unitStep?.run).toBe("npm run test:unit:full");
  });

  it("runs the review-scope gate before the full suite", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as { jobs: { quality: { steps: Array<{ name?: string }> } } };
    const names = workflow.jobs.quality.steps.map((step) => step.name);
    expect(names.indexOf("PR review scope")).toBeGreaterThan(-1);
    expect(names.indexOf("PR review scope")).toBeLessThan(
      names.indexOf("Unit tests"),
    );
  });

  it("reconciles the exact quality gate on main every day", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as {
      on: { schedule?: Array<{ cron?: string }>; workflow_dispatch?: unknown };
      jobs: { quality: { steps: Array<{ name?: string; if?: string }> } };
    };
    expect(workflow.on.schedule?.[0]?.cron).toMatch(/^30 15 \* \* \*$/);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    const scopeStep = workflow.jobs.quality.steps.find(
      (step) => step.name === "PR review scope",
    );
    expect(scopeStep?.if).toContain("pull_request");
  });
});
