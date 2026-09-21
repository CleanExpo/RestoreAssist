import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * RA-7466 — the P0-1 private-buckets acceptance script existed and
 * `npm run e2e:p0-1` was in package.json, but nothing invoked it.
 *
 * These tests lift the shipped workflow's own shell blocks out of the YAML
 * and execute them. A retyped stand-in would let the committed file drift
 * from the proof.
 */

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, ".github", "workflows", "p0-1-private-buckets.yml");
const SCRIPT = join(ROOT, "scripts", "e2e", "p0-1-private-buckets-acceptance.mjs");
const PACKAGE_JSON = join(ROOT, "package.json");

const SECRET_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, unknown>;
  uses?: string;
}

function workflow(path: string) {
  return parse(readFileSync(path, "utf8")) as {
    on: {
      schedule?: unknown;
      workflow_dispatch?: unknown;
      pull_request?: unknown;
    };
    jobs: Record<
      string,
      {
        name?: string;
        if?: string;
        needs?: string | string[];
        steps?: Step[];
        outputs?: Record<string, string>;
      }
    >;
  };
}

function secretsGateScript(): string {
  const step = workflow(WORKFLOW).jobs["secrets-gate"]?.steps?.find((s) => s.id === "check");
  if (!step?.run) throw new Error("secrets-gate 'check' step not found");
  return step.run;
}

function acceptanceRunScript(): string {
  const step = workflow(WORKFLOW).jobs.acceptance?.steps?.find((s) =>
    (s.name ?? "").includes("Run P0-1"),
  );
  if (!step?.run) throw new Error("acceptance 'Run P0-1' step not found");
  return step.run;
}

interface RunResult {
  code: number;
  stdout: string;
  outputs: string;
}

function runGate(present: readonly string[]): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "p0-1-secrets-"));
  const script = join(dir, "secrets-gate.sh");
  const ghOutput = join(dir, "github_output");
  const summary = join(dir, "step_summary");
  writeFileSync(script, secretsGateScript());
  writeFileSync(ghOutput, "");
  writeFileSync(summary, "");

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const name of SECRET_ENV) env[name] = "";
  for (const name of present) env[name] = `stub-${name}`;
  env.GITHUB_OUTPUT = ghOutput;
  env.GITHUB_STEP_SUMMARY = summary;

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

function runAcceptance(scriptExit: number): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "p0-1-accept-"));
  const script = join(dir, "acceptance.sh");
  const npmStub = join(dir, "npm");
  writeFileSync(script, acceptanceRunScript());
  writeFileSync(
    npmStub,
    `#!/bin/bash
if [ "$1" = "run" ] && [ "$2" = "e2e:p0-1" ]; then
  exit ${scriptExit}
fi
echo "unexpected npm invocation: $*" >&2
exit 99
`,
  );
  chmodSync(npmStub, 0o755);

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  env.PATH = `${dir}:${env.PATH ?? ""}`;
  env.SUPABASE_URL = "stub-url";
  env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";

  try {
    const stdout = execFileSync("bash", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    return { code: 0, stdout, outputs: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? -1,
      stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`,
      outputs: "",
    };
  }
}

describe("p0-1 private-buckets workflow wiring", () => {
  it("is the file CI will load, and package.json still points at the script", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["e2e:p0-1"]).toBe(
      "node scripts/e2e/p0-1-private-buckets-acceptance.mjs",
    );
    const source = readFileSync(WORKFLOW, "utf8");
    expect(source).toContain("npm run e2e:p0-1");
    expect(source).not.toMatch(/\bpnpm\b/);
  });

  it("acceptance depends on secrets-gate and refuses to run unprovisioned", () => {
    const parsed = workflow(WORKFLOW);
    const acceptance = parsed.jobs.acceptance;
    const needs = Array.isArray(acceptance?.needs) ? acceptance.needs : [acceptance?.needs];
    expect(needs).toContain("secrets-gate");
    expect(acceptance?.if).toContain("provisioned == 'true'");
  });

  it("binds the two secrets as env only — never interpolates them into a run block", () => {
    const parsed = workflow(WORKFLOW);
    for (const job of Object.values(parsed.jobs)) {
      for (const step of job.steps ?? []) {
        const run = step.run ?? "";
        expect(run).not.toContain("secrets.");
        if (run.includes("MISSING") || run.includes("e2e:p0-1")) {
          expect(JSON.stringify(step.env ?? {})).toContain("${{ secrets.SUPABASE_URL }}");
          expect(JSON.stringify(step.env ?? {})).toContain(
            "${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
          );
        }
      }
    }
  });

  it("pins checkout and setup-node to the approved immutable SHAs", () => {
    const steps = workflow(WORKFLOW).jobs.acceptance?.steps ?? [];
    const uses = steps.map((s) => s.uses).filter(Boolean);
    expect(uses).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(uses).toContain("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
  });
});

describe("p0-1 secrets-gate (extracted shell)", () => {
  it("reports provisioned and exits 0 when both secrets are present", () => {
    const r = runGate(SECRET_ENV);
    expect(r.code).toBe(0);
    expect(r.outputs).toContain("provisioned=true");
    expect(r.stdout).not.toContain("::error");
    expect(r.stdout).toContain("::notice");
  });

  it("exits 2 and refuses green when both secrets are absent", () => {
    const r = runGate([]);
    expect(r.code).toBe(2);
    expect(r.outputs).toContain("provisioned=false");
    expect(r.stdout).toContain("SKIPPED");
    expect(r.stdout).toContain("NOT a pass");
    expect(r.stdout).toContain("::error");
  });

  it("names every missing secret when none are set", () => {
    const out = runGate([]).stdout;
    for (const name of SECRET_ENV) expect(out).toContain(name);
  });

  it.each([
    ["url only", ["SUPABASE_URL"] as const],
    ["key only", ["SUPABASE_SERVICE_ROLE_KEY"] as const],
  ])("treats %s as unprovisioned (AND, not OR) and exits 2", (_label, present) => {
    const r = runGate(present);
    expect(r.code).toBe(2);
    expect(r.outputs).toContain("provisioned=false");
  });

  it("names only the secret actually missing from a partial set", () => {
    const out = runGate(["SUPABASE_URL"]).stdout;
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(out).not.toMatch(/not set:\s*SUPABASE_URL\b/);
  });

  it("never echoes a secret value", () => {
    const out = runGate(["SUPABASE_URL"]).stdout;
    expect(out).not.toContain("stub-");
  });
});

describe("p0-1 acceptance exit mapping (extracted shell, npm stubbed)", () => {
  it("maps script exit 0 to step exit 0", () => {
    const r = runAcceptance(0);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("PASSED");
  });

  it("maps script exit 1 to step exit 1 so the workflow fails", () => {
    const r = runAcceptance(1);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("FAILED");
  });

  it("maps script exit 2 (could not run) to step exit 2, never green", () => {
    const r = runAcceptance(2);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain("could NOT RUN");
  });

  it("maps an unexpected exit to the same code, never green", () => {
    const r = runAcceptance(127);
    expect(r.code).toBe(127);
    expect(r.stdout).toContain("could NOT RUN");
  });
});

describe("p0-1 acceptance script fail-closed without env", () => {
  it("exits 2 with NOT green when the live project env is missing", () => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    delete env.SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    env.SUPABASE_URL = "";
    env.NEXT_PUBLIC_SUPABASE_URL = "";
    env.SUPABASE_SERVICE_ROLE_KEY = "";

    try {
      execFileSync("node", [SCRIPT], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      throw new Error("script exited 0 — an unrun gate must not be green");
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      if (e.status === undefined && (err as Error).message?.includes("unrun gate")) {
        throw err;
      }
      expect(e.status).toBe(2);
      expect(`${e.stdout ?? ""}${e.stderr ?? ""}`).toContain("NOT green");
    }
  });
});
