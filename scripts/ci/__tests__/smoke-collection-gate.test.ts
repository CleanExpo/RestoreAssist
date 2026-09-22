import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

import playwrightConfig from "../../../config/playwright.config";

/**
 * RA-7648. The live-site smoke (smoke-prod.yml) loads every spec under e2e/
 * before --grep picks the @smoke tests. On 21/09 PR #2264 added walkthrough
 * specs that throw at import for any non-local URL, so every fifteen-minute
 * run after it collected zero tests and tested nothing about production.
 *
 * These tests hold the three parts of the fix in place:
 *   1. every smoke project ignores the walkthrough folder;
 *   2. the required Quality Checks job proves the suite still collects, and
 *      fails on a collection error or on 0 tests;
 *   3. a red production smoke opens one issue, not one per run.
 *
 * The workflow steps are executed, not just read: each `run:` block is handed
 * to `bash -e` (GitHub's default shell) with `npx` or `gh` replaced by a stub,
 * so a step that cannot fail, or that opens a second issue, fails here.
 */

type Step = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
};
type Job = { permissions?: Record<string, string>; steps: Step[] };
type Workflow = { permissions?: Record<string, string>; jobs: Record<string, Job> };

function workflow(file: string): Workflow {
  return parse(
    readFileSync(join(process.cwd(), ".github/workflows", file), "utf8"),
  ) as Workflow;
}

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs a step's `run:` block under bash -e with one command stubbed. */
function runStep(
  script: string,
  stubName: string,
  stubBody: string,
  env: Record<string, string>,
) {
  const dir = mkdtempSync(join(tmpdir(), "smoke-gate-"));
  scratch.push(dir);
  const stub = join(dir, stubName);
  writeFileSync(stub, `#!/bin/sh\n${stubBody}\n`);
  chmodSync(stub, 0o755);
  const file = join(dir, "step.sh");
  writeFileSync(file, script);
  const log = join(dir, "calls.log");
  const result = spawnSync("bash", ["-e", file], {
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      HOME: dir,
      CALLS: log,
      ...env,
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  return { status: result.status, output: `${result.stdout}${result.stderr}`, calls };
}

describe("the smoke projects never load the walkthrough specs", () => {
  const walkthroughSpec = join(process.cwd(), "e2e/walkthrough/owner.spec.ts");
  const authSetup = join(process.cwd(), "e2e/auth.setup.ts");
  const smokeSpec = join(process.cwd(), "e2e/health.spec.ts");

  function ignores(project: string, file: string): boolean {
    const found = playwrightConfig.projects?.find((p) => p.name === project);
    expect(found, `project ${project} exists`).toBeDefined();
    const raw = found?.testIgnore;
    const patterns = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    return patterns.some((p) => p instanceof RegExp && p.test(file));
  }

  // A project-level testIgnore REPLACES the top-level one, so each project
  // has to carry both patterns itself.
  it.each(["chromium", "mobile-chrome", "tablet-chrome"])(
    "%s ignores e2e/walkthrough/ and still ignores auth.setup",
    (project) => {
      expect(ignores(project, walkthroughSpec)).toBe(true);
      expect(ignores(project, authSetup)).toBe(true);
      expect(ignores(project, smokeSpec)).toBe(false);
    },
  );
});

describe("Quality Checks proves the production smoke suite still collects", () => {
  const steps = workflow("pr-checks.yml").jobs.quality.steps;
  const collect = steps.find(
    (s) => s.run?.includes("--grep @smoke") && s.run.includes("--list"),
  );

  it("has the collection step, after npm ci, aimed at the production URL", () => {
    expect(collect, "a --grep @smoke --list step in the quality job").toBeDefined();
    const npmCi = steps.findIndex((s) => s.run?.trim() === "npm ci");
    expect(npmCi).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf(collect as Step)).toBeGreaterThan(npmCi);
  });

  const stub =
    'printf "%s|%s\\n" "$PLAYWRIGHT_BASE_URL" "$*" >> "$CALLS"\nprintf "%s\\n" "$FAKE_OUT"\nexit "$FAKE_RC"';

  it("passes when the suite collects more than 0 tests, running the smoke command", () => {
    const r = runStep(collect?.run ?? "exit 99", "npx", stub, {
      FAKE_RC: "0",
      FAKE_OUT: "Listing tests:\nTotal: 17 tests in 6 files",
    });
    expect(r.status).toBe(0);
    expect(r.calls).toContain("https://restoreassist.app|");
    expect(r.calls).toContain(
      "--no-install playwright test -c config/playwright.config.ts --grep @smoke --project=chromium --no-deps --list",
    );
  });

  it("fails when collection exits non-zero (the 21/09 walkthrough crash)", () => {
    const r = runStep(collect?.run ?? "exit 0", "npx", stub, {
      FAKE_RC: "1",
      FAKE_OUT:
        'Error: walkthrough refuses non-local base URL "https://restoreassist.app"\nTotal: 0 tests in 0 files',
    });
    expect(r.status).not.toBe(0);
  });

  it("fails when the suite collects 0 tests even though it exits 0", () => {
    const r = runStep(collect?.run ?? "exit 0", "npx", stub, {
      FAKE_RC: "0",
      FAKE_OUT: "Listing tests:\nTotal: 0 tests in 0 files",
    });
    expect(r.status).not.toBe(0);
  });
});

describe("a red production smoke opens one issue, not one per run", () => {
  const wf = workflow("smoke-prod.yml");
  const smokeSteps = wf.jobs.smoke.steps;
  const last = smokeSteps[smokeSteps.length - 1];

  it("lets only the smoke job write issues", () => {
    expect(wf.jobs.smoke.permissions).toEqual({ contents: "read", issues: "write" });
    expect(wf.permissions).toEqual({ contents: "read" });
  });

  it("ends with a failure-only issue step that ignores the deliberate stale red", () => {
    expect(last.if).toContain("failure()");
    // Flows red, or a failure that is not the daily stale/unverifiable exit.
    expect(last.if).toContain("steps.flows.outcome == 'failure'");
    expect(last.if).toContain("steps.freshness.outputs.stale == ''");
    expect(smokeSteps.some((s) => s.id === "flows")).toBe(true);
    expect(smokeSteps.some((s) => s.id === "freshness")).toBe(true);
    expect(last.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });

  const gh =
    'printf "%s\\n" "$*" >> "$CALLS"\ncase "$1 $2" in\n  "issue list") printf "%s\\n" "$FAKE_OPEN" ;;\nesac\nexit 0';

  it("opens exactly one labelled issue when none is open", () => {
    const r = runStep(last.run ?? "exit 99", "gh", gh, {
      FAKE_OPEN: "0",
      RUN_URL: "https://example.test/run/1",
    });
    expect(r.status).toBe(0);
    const creates = r.calls.split("\n").filter((l) => l.startsWith("issue create"));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain("--label smoke-prod-red");
    expect(r.calls).toMatch(/^issue list .*--label smoke-prod-red.*--state open/m);
  });

  it("opens nothing while a smoke-prod-red issue is already open", () => {
    const r = runStep(last.run ?? "exit 99", "gh", gh, {
      FAKE_OPEN: "1",
      RUN_URL: "https://example.test/run/2",
    });
    expect(r.status).toBe(0);
    expect(r.calls).not.toMatch(/^issue create/m);
  });
});
