import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { evaluatePrScope } from "../lib/check-pr-scope.mjs";

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
    ) as {
      jobs: {
        quality: { steps: Array<{ name?: string; run?: string }> };
        "unit-tests-shard": {
          steps: Array<{ name?: string; run?: string; if?: string }>;
        };
      };
    };
    // RA-8625: CI runs the same vitest command as `test:unit:full`, split into
    // shards, plus the pilot-harness package tests once. The two package
    // scripts below are the pieces the shards and that step run.
    expect(packageJson.scripts["test:unit"]).toBe(
      "vitest run --config config/vitest.config.js",
    );
    const shardSteps = workflow.jobs["unit-tests-shard"].steps;
    const unitStep = shardSteps.find((step) => step.name === "Unit tests");
    expect(unitStep?.run).toBe(
      "npm run test:unit -- --shard=${{ matrix.shard }}/4",
    );
    // RA-8629: the pilot-harness step must run exactly once, on shard 1. If
    // the condition is removed it would run on all 4 shards; if it is changed
    // it could run on none, and the old existence check would still pass.
    const pilotSteps = shardSteps.filter(
      (step) => step.run === "npm run test:pilot-harness",
    );
    expect(pilotSteps).toHaveLength(1);
    expect(pilotSteps[0].if).toBe("matrix.shard == 1");
    expect(
      workflow.jobs.quality.steps.some((step) => step.name === "Unit tests"),
    ).toBe(false);
  });

  it("runs the review-scope gate before the full suite", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as {
      jobs: { "unit-tests-shard": { steps: Array<{ name?: string }> } };
    };
    const names = workflow.jobs["unit-tests-shard"].steps.map(
      (step) => step.name,
    );
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

  it("keeps the live replay index out of Prisma transactions", () => {
    const columnMigration = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20260828213000_job_file_audit_intake_replay_guard/migration.sql",
      ),
      "utf8",
    );
    const indexMigrationName =
      "20260828213100_job_file_audit_intake_replay_guard_index";
    const indexMigration = readFileSync(
      join(ROOT, "prisma/migrations", indexMigrationName, "migration.sql"),
      "utf8",
    );

    expect(columnMigration).not.toContain("CREATE UNIQUE INDEX");
    expect(indexMigration).toContain("CREATE UNIQUE INDEX CONCURRENTLY");
    expect(indexMigration).toContain("NOT index_state.indisvalid");
    expect(indexMigration).toContain("NOT index_state.indisready");
    expect(indexMigration).toContain(
      "Never let IF NOT EXISTS hide broken state",
    );

    const replayProofScriptPath =
      "scripts/ci/apply-and-verify-job-file-audit-replay-index.sh";
    const replayProofScript = readFileSync(
      join(ROOT, replayProofScriptPath),
      "utf8",
    );
    expect(replayProofScript).toContain('-f "$migration_file"');
    expect(replayProofScript).toContain("index_state.indisunique");
    expect(replayProofScript).toContain("index_state.indisvalid");
    expect(replayProofScript).toContain("index_state.indisready");
    expect(replayProofScript).toContain("drop_recoverable_index");
    expect(replayProofScript).toContain("DROP INDEX CONCURRENTLY");
    expect(replayProofScript).toContain(
      '[[ "$current_state" != "recoverable" ]]',
    );
    expect(replayProofScript).toContain('initial_state" == "valid"');
    expect(replayProofScript).toContain(
      "Replay-index mutation unexpectedly accepted duplicate keys.",
    );
    expect(replayProofScript).toContain("WHEN unique_violation");
    expect(replayProofScript).toContain(
      "Refusing to apply the replay-index CI probe outside local ephemeral Postgres.",
    );

    for (const path of [
      ".github/workflows/pr-checks.yml",
      ".github/workflows/release-gate.yml",
      ".github/workflows/sketch-e2e.yml",
      "scripts/ci/test-with-db.sh",
    ]) {
      const surface = readFileSync(join(ROOT, path), "utf8");
      expect(surface, path).toContain(indexMigrationName);
      expect(surface, path).toContain(replayProofScriptPath);
      expect(surface, path).toMatch(
        /prisma migrate deploy[\s\S]{0,500}apply-and-verify-job-file-audit-replay-index\.sh/,
      );
    }
  });

  it("gives the unit suite its own job and timeout with documented headroom (RA-7443)", () => {
    const yaml = readFileSync(
      join(ROOT, ".github/workflows/pr-checks.yml"),
      "utf8",
    );
    const workflow = parse(yaml) as {
      jobs: {
        quality: { "timeout-minutes"?: number; needs?: unknown };
        "unit-tests-shard": {
          "timeout-minutes"?: number;
          needs?: unknown;
          strategy?: {
            "fail-fast"?: boolean;
            matrix?: { shard?: number[] };
          };
        };
      };
    };

    expect(workflow.jobs.quality["timeout-minutes"]).toBe(20);
    expect(workflow.jobs.quality.needs).toBeUndefined();

    // RA-8625: the suite runs as 4 parallel shards; each keeps the budget.
    const shard = workflow.jobs["unit-tests-shard"];
    expect(shard).toBeDefined();
    expect(shard["timeout-minutes"]).toBe(25);
    expect(shard.needs).toBeUndefined();
    expect(shard.strategy?.["fail-fast"]).toBe(false);
    expect(shard.strategy?.matrix?.shard).toEqual([1, 2, 3, 4]);

    // 50% headroom on the worst measured 11.20 min suite is 16.81 min.
    // 25 min is 123% headroom; the comment must keep that arithmetic visible.
    expect(yaml).toContain("123% headroom");
    expect(yaml).toContain("50% headroom floor: 16.81 min");
    expect(yaml).toContain("timeout-minutes: 25");
  });

  it("keeps one aggregate 'Unit Tests' result that fails unless every shard succeeds (RA-8625)", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as {
      jobs: {
        "unit-tests": {
          name?: string;
          needs?: unknown;
          if?: string;
          steps: Array<{ run?: string; env?: Record<string, string> }>;
        };
      };
    };
    const aggregate = workflow.jobs["unit-tests"];
    // The name and id other tooling and humans read: one result, not four.
    expect(aggregate.name).toBe("Unit Tests");
    expect(aggregate.needs).toEqual(["unit-tests-shard"]);
    // always(): a failed, cancelled or skipped shard must still reach this job.
    expect(aggregate.if).toBe("always()");
    const step = aggregate.steps.find((s) => s.env?.SHARDS_RESULT);
    expect(step?.env?.SHARDS_RESULT).toBe(
      "${{ needs.unit-tests-shard.result }}",
    );
    // Only an exact `success` passes; anything else exits non-zero.
    expect(step?.run).toContain('!= "success"');
    expect(step?.run).toContain("exit 1");
  });

  it("keeps the database, migrations and env on every unit-test shard (RA-8625)", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as {
      jobs: {
        "unit-tests-shard": {
          services?: { postgres?: { image?: string } };
          steps: Array<{ name?: string; run?: string }>;
        };
      };
    };
    const shard = workflow.jobs["unit-tests-shard"];
    expect(shard.services?.postgres?.image).toContain("pgvector/pgvector@");
    const names = shard.steps.map((s) => s.name);
    const order = [
      "Install dependencies",
      "Generate Prisma client",
      "Pre-resolve CONCURRENTLY migrations (Supabase-only syntax)",
      "Apply migrations for DB-gated tests",
      "Apply and verify paid-audit replay index",
      "Test-parity guard (env-gated suites must not skip)",
      "Unit tests",
    ].map((n) => names.indexOf(n));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("does not raise vitest maxWorkers without the three-run evidence RA-7443 requires", () => {
    const vitestConfig = readFileSync(
      join(ROOT, "config/vitest.config.js"),
      "utf8",
    );
    expect(vitestConfig).toMatch(/maxWorkers:\s*1/);
    expect(vitestConfig).toMatch(/minWorkers:\s*1/);
  });

  it("runs the test-parity guard immediately before unit tests (RA-7467)", () => {
    const workflow = parse(
      readFileSync(join(ROOT, ".github/workflows/pr-checks.yml"), "utf8"),
    ) as {
      jobs: {
        "unit-tests-shard": {
          steps: Array<{
            name?: string;
            run?: string;
            env?: Record<string, string>;
          }>;
        };
      };
    };
    const steps = workflow.jobs["unit-tests-shard"].steps;
    const guardIdx = steps.findIndex(
      (step) =>
        step.name === "Test-parity guard (env-gated suites must not skip)",
    );
    const unitIdx = steps.findIndex((step) => step.name === "Unit tests");

    expect(guardIdx).toBeGreaterThan(-1);
    expect(unitIdx).toBe(guardIdx + 1);
    expect(steps[guardIdx]?.run).toBe(
      "node scripts/ci/check-test-parity.mjs --strict",
    );
    expect(steps[unitIdx]?.run).toBe(
      "npm run test:unit -- --shard=${{ matrix.shard }}/4",
    );
    expect(steps[guardIdx]?.env).toEqual(steps[unitIdx]?.env);
    expect(steps[unitIdx]?.env).toEqual({
      DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
      DIRECT_URL: "postgresql://ci:ci@localhost:5432/ci",
    });
  });
});
