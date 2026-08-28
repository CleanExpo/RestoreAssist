import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The pilot canary must not block a release it cannot grade.
 *
 * Production could not be promoted at all. `deploy-production.yml` demands a
 * release-gate artifact named for the exact SHA; `release-gate.yml` runs its
 * `score` job only after `pilot-canary`; the canary's `secrets-gate` exited 2
 * because all eight PILOT_TESTER secrets are empty. So `score` was skipped, no
 * artifact was produced, and the deploy would have rejected its own
 * authorisation. PR #2043 added that dependency, so the gate had never once
 * been satisfiable.
 *
 * Advisory does NOT mean the canary pretends to pass. `swarm` still refuses to
 * run without secrets, and the release gate says loudly that no canary evidence
 * backs the score.
 */

const ROOT = process.cwd();
const CANARY = join(ROOT, ".github", "workflows", "pilot-canary.yml");
const PR_HARNESS = join(ROOT, ".github", "workflows", "pilot-harness-pr.yml");
const RELEASE_GATE = join(ROOT, ".github", "workflows", "release-gate.yml");

/** The eight secrets the gate script reads, by its own env-var names. */
const SECRET_ENV = [
  "POOL_JSON",
  "DATABASE_URL",
  "RESTOREASSIST_AI_API_KEY",
  "PILOT_TESTER_JUDGE_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "EVIDENCE_BUNDLE_URL",
  "EVIDENCE_BUNDLE_SHA256",
  "ALLOWED_DATABASE_HOSTS",
] as const;

/** Repository secret names, which differ from the env names above. */
const SECRET_NAMES = [
  "PILOT_TESTER_USER_POOL_JSON",
  "PILOT_TESTER_DATABASE_URL",
  "PILOT_TESTER_ALLOWED_DATABASE_HOSTS",
  "RESTOREASSIST_AI_API_KEY",
  "PILOT_TESTER_JUDGE_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "PILOT_TESTER_EVIDENCE_BUNDLE_URL",
  "PILOT_TESTER_EVIDENCE_BUNDLE_SHA256",
] as const;

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, unknown>;
}

/** Parse a workflow file into the subset of its shape these tests assert on. */
function workflow(path: string) {
  return parse(readFileSync(path, "utf8")) as {
    on: {
      pull_request?: unknown;
      workflow_call?: {
        secrets?: Record<string, { required?: boolean }>;
        outputs?: Record<string, { value?: string }>;
      };
    };
    jobs: Record<
      string,
      { name?: string; if?: string; needs?: string | string[]; steps?: Step[]; outputs?: Record<string, string> }
    >;
  };
}

/** The shipped `secrets-gate` shell, lifted out of the YAML. */
function secretsGateScript(): string {
  const step = workflow(CANARY).jobs["secrets-gate"]?.steps?.find((s) => s.id === "check");
  if (!step?.run) throw new Error("secrets-gate 'check' step not found in pilot-canary.yml");
  return step.run;
}

interface RunResult {
  code: number;
  stdout: string;
  outputs: string;
}

/** Execute that script with a chosen subset of the eight secrets populated. */
function runGate(present: readonly string[]): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "pilot-canary-"));
  const script = join(dir, "secrets-gate.sh");
  const ghOutput = join(dir, "github_output");
  writeFileSync(script, secretsGateScript());
  writeFileSync(ghOutput, "");

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  // Start from all-empty so a value inherited from the ambient environment
  // cannot make an "unprovisioned" case look provisioned.
  for (const name of SECRET_ENV) env[name] = "";
  for (const name of present) env[name] = `stub-${name}`;
  env.GITHUB_OUTPUT = ghOutput;

  try {
    const stdout = execFileSync("bash", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    return { code: 0, stdout, outputs: readFileSync(ghOutput, "utf8") };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? -1,
      stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`,
      outputs: readFileSync(ghOutput, "utf8"),
    };
  }
}

describe("pilot canary secrets gate", () => {
  it("reports provisioned when all eight secrets are present", () => {
    const r = runGate(SECRET_ENV);
    expect(r.code).toBe(0);
    expect(r.outputs).toContain("provisioned=true");
    expect(r.stdout).not.toContain("::warning");
  });

  // The defect this change exists for: an unprovisioned canary took the whole
  // release gate down with it, and with it the ability to deploy at all.
  it("does not fail the run when no secrets are provisioned", () => {
    const r = runGate([]);
    expect(r.code).toBe(0);
    expect(r.outputs).toContain("provisioned=false");
  });

  it("warns rather than errors when unprovisioned", () => {
    const r = runGate([]);
    expect(r.stdout).toContain("::warning");
    expect(r.stdout).not.toContain("::error");
  });

  // "Advisory always" is the owner's decision: a partial set is treated the
  // same as none, rather than being escalated back into a hard failure.
  it.each([
    ["one secret set", ["POOL_JSON"]],
    ["all but one set", SECRET_ENV.slice(0, -1)],
  ])("treats %s as unprovisioned without failing", (_label, present) => {
    const r = runGate(present as readonly string[]);
    expect(r.code).toBe(0);
    expect(r.outputs).toContain("provisioned=false");
  });

  it("names every missing secret when none are set", () => {
    const out = runGate([]).stdout;
    for (const name of SECRET_NAMES) expect(out).toContain(name);
  });

  // The case the old message was useless for: "all of them are required" tells
  // someone who has set six of eight nothing about which two remain.
  it("names only the secrets actually missing from a partial set", () => {
    const present = SECRET_ENV.filter((n) => n !== "UNSPLASH_ACCESS_KEY");
    const out = runGate(present).stdout;
    expect(out).toContain("UNSPLASH_ACCESS_KEY");
    expect(out).not.toContain("PILOT_TESTER_USER_POOL_JSON");
    expect(out).not.toContain("PILOT_TESTER_DATABASE_URL");
  });

  // The warning is printed to a public log.
  it("never echoes a secret value", () => {
    const out = runGate(SECRET_ENV.slice(0, 3)).stdout;
    expect(out).not.toContain("stub-");
  });
});

describe("pilot canary reusable-workflow contract", () => {
  // A `required: true` secret that does not exist fails the calling job at
  // INITIALISATION -- zero steps, no logs, 404 on the log endpoint. That is why
  // the release-gate failure was unreadable and could only be diagnosed by
  // dispatching the canary directly.
  it("declares no required secrets, which would fail the caller before any step runs", () => {
    const secrets = workflow(CANARY).on.workflow_call?.secrets ?? {};
    const required = Object.entries(secrets)
      .filter(([, spec]) => spec?.required === true)
      .map(([name]) => name);
    expect(required).toEqual([]);
    // Guard the guard: if the secrets block vanished, the check above would
    // pass vacuously.
    expect(Object.keys(secrets).length).toBeGreaterThanOrEqual(8);
  });

  it("exposes provisioned to callers", () => {
    const outputs = workflow(CANARY).on.workflow_call?.outputs ?? {};
    expect(Object.keys(outputs)).toContain("provisioned");
    expect(String(outputs.provisioned?.value)).toContain("secrets-gate");
  });

  // Advisory must not become "pretends to grade". The swarm is the part that
  // would consume AI budget and produce a verdict; it must still refuse.
  it("still refuses to run the swarm without secrets", () => {
    const swarm = workflow(CANARY).jobs.swarm;
    expect(swarm?.if).toContain("provisioned == 'true'");
  });
});

describe("pilot workflow presentation", () => {
  it("separates the PR harness from the live canary", () => {
    expect(workflow(CANARY).on.pull_request).toBeUndefined();
    expect(workflow(PR_HARNESS).on.pull_request).toBeDefined();
  });

  it("labels the PR job so a skipped live pilot cannot be inferred", () => {
    const prJob = workflow(PR_HARNESS).jobs["dry-run"];
    expect(prJob?.name).toContain("live pilot not requested");
    const commands = (prJob?.steps ?? []).map((step) => step.run);
    expect(commands).toContain("npm test");
    expect(commands).toContain("npm run dryrun");
  });
});

describe("release gate surfaces the missing canary", () => {
  it("still depends on the canary", () => {
    const score = workflow(RELEASE_GATE).jobs.score;
    const needs = Array.isArray(score?.needs) ? score.needs : [score?.needs];
    expect(needs).toContain("pilot-canary");
  });

  // The receipt cannot carry this: verify-release-gate-run.mjs compares the
  // report's top-level keys against a fixed set, so an extra field would break
  // the deploy. The run itself therefore has to say it out loud.
  it("says out loud when the score carries no canary evidence", () => {
    const steps = workflow(RELEASE_GATE).jobs.score?.steps ?? [];
    // env matters as much as run: the canary flag reaches the shell as an env
    // binding, so a run-only scan would miss the wiring entirely.
    const source = steps
      .map((s) =>
        [s.name ?? "", s.run ?? "", JSON.stringify(s.env ?? {})].join("\n"),
      )
      .join("\n");
    expect(source).toContain("needs.pilot-canary.outputs.provisioned");
    expect(source).toContain("::warning");
    expect(source).toContain("GITHUB_STEP_SUMMARY");
  });
});
