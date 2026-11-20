/**
 * RA-8388 rollback shape: which "back the code out" release the production
 * release script accepts once migration
 * 20261116120000_ra_8388_evidence_link_and_duplicate_guard is applied.
 *
 * The rule pinned here: a rollback release must KEEP the migration folder.
 * A revert that removes it lowers the expected migration count by one, the
 * live ledger still has the row, and preflight refuses the release with
 * "current production migration health is not rollback-safe".
 *
 * No database and no network. The chain is the real code, end to end:
 *   1. the names of the real prisma/migrations folders, copied as empty
 *      folders into temporary trees (with and without this migration);
 *   2. scripts/ci/expected-migration-ledger.mjs over each tree: the count and
 *      fingerprint the deploy workflow passes to preflight;
 *   3. the real GET /api/health/migrations handler, with the ledger query
 *      stubbed to return every folder name as applied (production after the
 *      migration has been applied);
 *   4. the real verify_rollback_target in
 *      scripts/ci/digitalocean-production-release.py, run in a python3
 *      subprocess with the two health reads stubbed to the answers above.
 *
 * RA_8388_ROLLBACK_SHAPE=folder-removed makes the "accepted" case use the
 * folder-removing tree, to watch it fail:
 *
 *   RA_8388_ROLLBACK_SHAPE=folder-removed npx vitest run \
 *     --config config/vitest.config.js scripts/ci/__tests__/ra-8388-rollback-shape.test.ts
 *
 * NOT covered: scripts/verify-production-migrations.sh (prisma migrate status
 * and migrate diff), which runs before preflight and needs a database. It is
 * the reason the three schema.prisma fields must stay as well as the folder.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";

import { expectedMigrationLedger } from "../expected-migration-ledger.mjs";

const queryRaw = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: async () => null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

import { GET } from "../../../app/api/health/migrations/route";

const MIGRATION = "20261116120000_ra_8388_evidence_link_and_duplicate_guard";
const REFUSAL = "current production migration health is not rollback-safe";
const repoRoot = resolve(__dirname, "..", "..", "..");
const migrationsDir = join(repoRoot, "prisma", "migrations");
const releaseScript = join(repoRoot, "scripts", "ci", "digitalocean-production-release.py");

/** The real migration folder names in this checkout. */
const repoNames = readdirSync(migrationsDir)
  .filter((name) => lstatSync(join(migrationsDir, name)).isDirectory())
  .sort();

const temporaryRoots: string[] = [];

/** A tree holding only empty prisma/migrations/<name>/ folders. */
function treeOf(names: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "ra8388-rollback-shape-"));
  temporaryRoots.push(root);
  for (const name of names) {
    mkdirSync(join(root, "prisma", "migrations", name), { recursive: true });
  }
  return root;
}

type Health = {
  status: string;
  counts: { applied: number; failed: number; rolled_back: number; total: number };
  databaseFingerprint: string;
  migrationLedgerFingerprint: string;
};

/** What the real health route reports for a ledger with these names applied. */
async function healthFor(appliedNames: readonly string[]): Promise<Health> {
  queryRaw.mockResolvedValueOnce(
    appliedNames.map((migration_name) => ({
      migration_name,
      finished_at: new Date("2026-11-17T00:00:00Z"),
      rolled_back_at: null,
      applied_steps_count: 1,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
    })),
  );
  const response = await GET(new NextRequest("http://localhost/api/health/migrations"));
  return (await response.json()) as Health;
}

// Loads the release script the way scripts/ci/test_digitalocean_production_release.py
// does, replaces its two public reads with the given answers, and makes any
// real network open raise.
const PYTHON = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("release", sys.argv[1])
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
given = json.loads(sys.stdin.read())

class NoNetwork:
    def open(self, *args, **kwargs):
        raise AssertionError("this test must not open a network connection")

release.NO_REDIRECT_OPENER = NoNetwork()
answers = {
    "/api/health": {"status": "ok", "checks": {"database": {"status": "ok"}, "env": {"status": "ok"}}},
    "/api/health/migrations": given["health"],
}
asked = []

def read_public_json(path, *, require_no_store):
    asked.append(path)
    return answers[path]

release.read_public_json = read_public_json
try:
    release.verify_rollback_target(
        given["database_fingerprint"], given["count"], given["ledger_fingerprint"]
    )
    print(json.dumps({"accepted": True, "error": None, "asked": asked}))
except RuntimeError as error:
    print(json.dumps({"accepted": False, "error": str(error), "asked": asked}))
`;

type Verdict = { accepted: boolean; error: string | null; asked: string[] };

/** Run the real preflight check for a release built from `root`. */
function preflight(root: string, health: Health): Verdict {
  const expected = expectedMigrationLedger(root);
  const run = spawnSync("python3", ["-c", PYTHON, releaseScript], {
    input: JSON.stringify({
      health,
      database_fingerprint: health.databaseFingerprint,
      count: expected.count,
      ledger_fingerprint: expected.fingerprint,
    }),
    encoding: "utf8",
    timeout: 30_000,
  });
  if (run.status !== 0) {
    throw new Error(`python3 exited ${run.status}: ${run.stderr || run.error}`);
  }
  return JSON.parse(run.stdout) as Verdict;
}

describe("RA-8388 rollback shape accepted by the production release script", () => {
  const keptNames = repoNames;
  const removedNames = repoNames.filter((name) => name !== MIGRATION);
  const shapes = {
    "folder-kept": () => treeOf(keptNames),
    "folder-removed": () => treeOf(removedNames),
  };
  const candidateShape =
    process.env.RA_8388_ROLLBACK_SHAPE === "folder-removed" ? "folder-removed" : "folder-kept";

  afterAll(() => {
    for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  });

  it("positive control: this checkout contains the migration, and production after the apply reports every folder", async () => {
    expect(repoNames).toContain(MIGRATION);
    expect(removedNames).toHaveLength(keptNames.length - 1);

    const health = await healthFor(keptNames);
    const kept = expectedMigrationLedger(treeOf(keptNames));
    const removed = expectedMigrationLedger(treeOf(removedNames));
    console.log(
      `[ra-8388] migration folders in this checkout: ${kept.count}; with the RA-8388 folder removed: ${removed.count}`,
    );
    // The names-only tree counts the same as the real directory.
    expect(kept).toEqual(expectedMigrationLedger(repoRoot));
    expect(health.status).toBe("ok");
    expect(health.counts).toEqual({
      applied: keptNames.length,
      failed: 0,
      rolled_back: 0,
      total: keptNames.length,
    });
    // The route and the workflow script fingerprint the same names the same way.
    expect(health.migrationLedgerFingerprint).toBe(kept.fingerprint);
    expect(removed.fingerprint).not.toBe(kept.fingerprint);
  });

  it("a rollback release is accepted by preflight when the migration is applied in production", async () => {
    // Default: the tree that keeps the folder. RA_8388_ROLLBACK_SHAPE=folder-removed
    // puts the folder-removing revert here instead, and this must then fail.
    const health = await healthFor(keptNames);
    const verdict = preflight(shapes[candidateShape](), health);
    expect(verdict.asked).toEqual(["/api/health", "/api/health/migrations"]);
    expect(
      verdict,
      `rollback shape "${candidateShape}" was refused by verify_rollback_target`,
    ).toMatchObject({ accepted: true, error: null });
  });

  it("a rollback release that removes the migration folder is refused as not rollback-safe", async () => {
    const health = await healthFor(keptNames);
    const verdict = preflight(shapes["folder-removed"](), health);
    // Both health reads happened, so the refusal is the ledger comparison and
    // not the earlier "not canonical" or "not a healthy rollback target" exits.
    expect(verdict.asked).toEqual(["/api/health", "/api/health/migrations"]);
    expect(verdict.accepted).toBe(false);
    expect(verdict.error).toBe(REFUSAL);
  });

  it("the same folder-removing release is accepted only where the migration was never applied", async () => {
    // The refusal above comes from the applied ledger row, not from the tree:
    // against a ledger without the row the same tree passes.
    const health = await healthFor(removedNames);
    expect(preflight(shapes["folder-removed"](), health)).toMatchObject({ accepted: true });
    // And a tree that keeps the folder is refused there (not yet applied).
    expect(preflight(shapes["folder-kept"](), health).error).toBe(REFUSAL);
  });

  it("the count alone is not the rule: a same-count tree with a different folder name is refused", async () => {
    const health = await healthFor(keptNames);
    const renamed = treeOf([...removedNames, "20261116120000_ra_8388_some_other_name"]);
    expect(expectedMigrationLedger(renamed).count).toBe(keptNames.length);
    expect(preflight(renamed, health).error).toBe(REFUSAL);
  });
});
