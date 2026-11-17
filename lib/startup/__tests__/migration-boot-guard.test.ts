import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { expectedMigrationLedger } from "../../../scripts/ci/expected-migration-ledger.mjs";
import {
  BOOT_GUARD_EXIT,
  assertRevisionMigrationsApplied,
  checkRevisionMigrations,
  revisionMigrationNames,
  shouldEnforceBootGuard,
} from "../migration-boot-guard";
import {
  classifyMigrationLedger,
  type MigrationAttempt,
} from "../migration-ledger";

const DONE = new Date("2026-11-17T00:00:00Z");

function repoWith(names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "ra-boot-guard-"));
  mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  for (const name of names) {
    mkdirSync(join(root, "prisma", "migrations", name));
  }
  // A file beside the folders, as migration_lock.toml is in the real tree.
  writeFileSync(join(root, "prisma", "migrations", "migration_lock.toml"), "");
  return root;
}

function finished(name: string): MigrationAttempt {
  return { migration_name: name, finished_at: DONE, rolled_back_at: null };
}

const quiet = { log: () => {}, sleep: async () => {} };

describe("checkRevisionMigrations", () => {
  it("passes when every migration in this revision is applied", async () => {
    const root = repoWith(["001_a", "002_b"]);
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [finished("001_a"), finished("002_b")],
      ...quiet,
    });
    expect(result).toEqual({ ok: true, revisionCount: 2 });
  });

  it("refuses when one migration in this revision is not applied", async () => {
    const root = repoWith(["001_a", "002_b"]);
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [finished("001_a")],
      ...quiet,
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: BOOT_GUARD_EXIT.MIGRATION_MISSING,
      missing: ["002_b"],
    });
  });

  it("passes when the database is ahead of this revision", async () => {
    // Migrations are applied before the code that needs them, so the running
    // older revision must keep booting against a newer database.
    const root = repoWith(["001_a"]);
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [finished("001_a"), finished("002_b")],
      ...quiet,
    });
    expect(result).toEqual({ ok: true, revisionCount: 1 });
  });

  it("refuses when a needed migration has an unresolved failed attempt", async () => {
    const root = repoWith(["001_a", "002_b"]);
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [
        finished("001_a"),
        finished("002_b"),
        { migration_name: "002_b", finished_at: null, rolled_back_at: null },
      ],
      ...quiet,
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: BOOT_GUARD_EXIT.MIGRATION_MISSING,
      missing: ["002_b"],
    });
  });

  it("refuses when a needed migration was only rolled back", async () => {
    const root = repoWith(["001_a"]);
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [
        { migration_name: "001_a", finished_at: null, rolled_back_at: DONE },
      ],
      ...quiet,
    });
    expect(result).toMatchObject({ ok: false, missing: ["001_a"] });
  });

  it("refuses with a different code when the ledger cannot be read, after retrying", async () => {
    const root = repoWith(["001_a"]);
    const readLedger = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const result = await checkRevisionMigrations({
      root,
      readLedger,
      attempts: 3,
      ...quiet,
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: BOOT_GUARD_EXIT.LEDGER_UNREADABLE,
    });
    expect(BOOT_GUARD_EXIT.LEDGER_UNREADABLE).not.toBe(
      BOOT_GUARD_EXIT.MIGRATION_MISSING,
    );
    expect(readLedger).toHaveBeenCalledTimes(3);
  });

  it("recovers when a later read succeeds", async () => {
    const root = repoWith(["001_a"]);
    let calls = 0;
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => {
        calls += 1;
        if (calls === 1) throw new Error("not yet");
        return [finished("001_a")];
      },
      attempts: 3,
      ...quiet,
    });
    expect(result).toEqual({ ok: true, revisionCount: 1 });
  });

  it("refuses when this revision's migration folder cannot be listed", async () => {
    const root = mkdtempSync(join(tmpdir(), "ra-boot-guard-empty-"));
    const result = await checkRevisionMigrations({
      root,
      readLedger: async () => [finished("001_a")],
      ...quiet,
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: BOOT_GUARD_EXIT.LEDGER_UNREADABLE,
    });
  });
});

describe("assertRevisionMigrationsApplied", () => {
  it("exits with the missing-migration code and says to apply, then redeploy", async () => {
    const root = repoWith(["001_a", "002_b"]);
    const lines: string[] = [];
    const exit = vi.fn();
    await assertRevisionMigrationsApplied({
      root,
      readLedger: async () => [finished("001_a")],
      log: (line) => lines.push(line),
      sleep: async () => {},
      exit,
    });
    expect(exit).toHaveBeenCalledWith(BOOT_GUARD_EXIT.MIGRATION_MISSING);
    const text = lines.join("\n");
    expect(text).toContain("002_b");
    expect(text).toMatch(/apply/i);
    expect(text).toMatch(/redeploy/i);
  });

  it("does not exit when everything is applied", async () => {
    const root = repoWith(["001_a"]);
    const exit = vi.fn();
    await assertRevisionMigrationsApplied({
      root,
      readLedger: async () => [finished("001_a")],
      ...quiet,
      exit,
    });
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("shouldEnforceBootGuard", () => {
  const base = { NEXT_RUNTIME: "nodejs", NODE_ENV: "production" };
  it("enforces on a production Node server", () => {
    expect(shouldEnforceBootGuard(base)).toBe(true);
  });
  it.each([
    ["the edge runtime", { ...base, NEXT_RUNTIME: "edge" }],
    ["development", { ...base, NODE_ENV: "development" }],
    ["tests", { ...base, NODE_ENV: "test" }],
    ["a Vercel function", { ...base, VERCEL: "1" }],
    ["the production build", { ...base, NEXT_PHASE: "phase-production-build" }],
  ])("does not enforce in %s", (_label, env) => {
    expect(shouldEnforceBootGuard(env)).toBe(false);
  });
});

describe("one rule, not two", () => {
  const repoRoot = resolve(__dirname, "..", "..", "..");

  it("lists the same migration folders as the CI ledger fingerprint", () => {
    expect(revisionMigrationNames(repoRoot).length).toBe(
      expectedMigrationLedger(repoRoot).count,
    );
  });

  it("the health route and the boot hook both call the shared rule", () => {
    const route = readFileSync(
      join(repoRoot, "app/api/health/migrations/route.ts"),
      "utf8",
    );
    const guard = readFileSync(
      join(repoRoot, "lib/startup/migration-boot-guard.ts"),
      "utf8",
    );
    const hook = readFileSync(join(repoRoot, "instrumentation.ts"), "utf8");
    expect(route).toContain("classifyMigrationLedger(");
    expect(route).not.toContain("hasUnresolvedAttempt");
    expect(guard).toContain("classifyMigrationLedger(");
    expect(hook).toContain("assertRevisionMigrationsApplied(");
  });

  it("does not count an attempt that finished and was then rolled back", () => {
    const finishedThenRolledBack = {
      migration_name: "a",
      finished_at: DONE,
      rolled_back_at: DONE,
    };
    expect(classifyMigrationLedger([finishedThenRolledBack])).toEqual({
      applied: [],
      failed: [],
      rolledBackOnly: ["a"],
      total: 1,
    });
  });

  it("the ledger alarm states only what the ledger check observed", () => {
    // Review round 1 (P1): the alarm opens on an unreadable probe and before
    // any deploy, and never reads deployment status, so it must not assert
    // that a deployment failed or which revision is serving.
    const alarm = readFileSync(
      join(repoRoot, "scripts/ci/migration-ledger-issue.mjs"),
      "utf8",
    );
    expect(alarm).not.toMatch(/will have failed/);
    expect(alarm).not.toMatch(/is still on the previous revision/);
    expect(alarm).toMatch(/does not read the deployment/);
    expect(alarm).toMatch(/redeploy/i);
  });

  it("classifies a mixed ledger", () => {
    expect(
      classifyMigrationLedger([
        finished("a"),
        { migration_name: "b", finished_at: null, rolled_back_at: null },
        { migration_name: "c", finished_at: null, rolled_back_at: DONE },
      ]),
    ).toEqual({ applied: ["a"], failed: ["b"], rolledBackOnly: ["c"], total: 3 });
  });
});
