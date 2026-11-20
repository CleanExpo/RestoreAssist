/**
 * RA-8388 release preconditions for migration
 * 20261116120000_ra_8388_evidence_link_and_duplicate_guard, proven against a
 * throwaway Postgres with the real schema, the real ledger and the real
 * `prisma migrate deploy`.
 *
 * OPT-IN. It runs only when RA_8388_MIGRATION_PROOF=1, through the local
 * database runner:
 *
 *   RA_8388_MIGRATION_PROOF=1 npm run test:db -- \
 *     scripts/ci/__tests__/ra-8388-migration-preconditions.test.ts
 *
 * It is not gated on DATABASE_URL alone because it drops and re-applies the
 * migration; it does that in a scratch database cloned from the run's own
 * (CREATE DATABASE ... TEMPLATE), never in the database other suites share.
 *
 * What it proves:
 *   1. scripts/ci/ra-8388-migration-applied.sql says APPLIED after the
 *      migration, NOT APPLIED after down.sql (ledger row still "finished"),
 *      and NOT APPLIED with no ledger row (a simulated before state).
 *   2. With another session holding a lock on MoistureReading, a real
 *      `prisma migrate deploy` gives up within seconds, creates nothing, and
 *      can be retried after `migrate resolve --rolled-back`.
 *   3. How Prisma runs one migration file (one transaction or statement by
 *      statement) and whether the lock timeout outlives the file. These are
 *      recorded, and the facts the migration's own comment relies on are
 *      asserted.
 *      Because the file is not one transaction, a timeout on a later
 *      statement leaves the earlier ones applied; the recovery (down.sql,
 *      resolve --rolled-back, deploy) is proven too.
 *   4. The RA_ROUNDTRIP_OBJECT_RE value for this branch matches nothing in
 *      `prisma migrate diff` when the migration is applied, and matches when
 *      one of its indexes is missing.
 *
 * RA_8388_PROOF_MIGRATION_SQL substitutes another file for migration.sql in
 * the temporary tree (used to watch the lock check fail on the old file).
 * RA_8388_PROOF_OUT names a directory to save the three applied-check outputs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

import { assertLocalConnectionString } from "../assert-local-test-db.mjs";

const MIGRATION = "20261116120000_ra_8388_evidence_link_and_duplicate_guard";
const repoRoot = resolve(__dirname, "..", "..", "..");
const migrationDir = join(repoRoot, "prisma", "migrations", MIGRATION);
const appliedSql = readFileSync(
  join(repoRoot, "scripts", "ci", "ra-8388-migration-applied.sql"),
  "utf8",
);

/** The value the Done recipe must set for apply mode on this branch. */
const RA_8388_ROUNDTRIP_OBJECT_RE =
  "evidenceItemId|metadataSha256|EvidenceItem_signed_capture_key";

const OBJECT_LABELS = [
  "column MoistureReading.evidenceItemId",
  "column EnvironmentalData.evidenceItemId",
  "column EvidenceItem.metadataSha256",
  "unique index MoistureReading_evidenceItemId_key",
  "unique index EnvironmentalData_evidenceItemId_key",
  "unique index EvidenceItem_signed_capture_key",
  "foreign key MoistureReading_evidenceItemId_fkey",
  "foreign key EnvironmentalData_evidenceItemId_fkey",
];

const enabled =
  process.env.RA_8388_MIGRATION_PROOF === "1" && !!process.env.DATABASE_URL;

type Run = { code: number | null; out: string; ms: number; timedOut: boolean };

describe.skipIf(!enabled)("RA-8388 migration release preconditions", () => {
  const scratchDb = `ra8388_scratch_${process.pid}`;
  let scratchUrl = "";
  let adminUrl = "";
  let tree = "";
  let db: pg.Client;
  const outDir = process.env.RA_8388_PROOF_OUT;

  const save = (name: string, text: string) => {
    if (!outDir) return;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, name), text.endsWith("\n") ? text : `${text}\n`);
  };

  const facts: string[] = [];
  const fact = (text: string) => {
    facts.push(text);
    console.log(`[ra-8388] ${text}`);
    save("facts.txt", facts.join("\n"));
  };

  const appliedCheck = async (): Promise<string[]> => {
    const res = await db.query(appliedSql);
    return res.rows.map((row: { line: string }) => row.line);
  };

  const prisma = (args: string[], limitMs: number): Promise<Run> =>
    new Promise((done) => {
      const started = Date.now();
      const child = spawn(join(tree, "node_modules", ".bin", "prisma"), args, {
        cwd: tree,
        env: {
          ...process.env,
          DATABASE_URL: scratchUrl,
          DIRECT_URL: scratchUrl,
          NO_COLOR: "1",
        },
      });
      let out = "";
      let timedOut = false;
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (out += chunk));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, limitMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        done({ code, out, ms: Date.now() - started, timedOut });
      });
    });

  const probe = (name: string, sql: string) => {
    const dir = join(tree, "prisma", "migrations", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "migration.sql"), sql);
  };

  beforeAll(async () => {
    const base = new URL(process.env.DATABASE_URL as string);
    const sourceDb = base.pathname.replace(/^\//, "");
    const scratch = new URL(base.href);
    scratch.pathname = `/${scratchDb}`;
    const admin = new URL(base.href);
    admin.pathname = "/postgres";
    scratchUrl = scratch.href;
    adminUrl = admin.href;
    assertLocalConnectionString(scratchUrl);
    assertLocalConnectionString(adminUrl);

    const adminClient = new pg.Client({ connectionString: adminUrl });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS "${scratchDb}"`);
    await adminClient.query(`CREATE DATABASE "${scratchDb}" TEMPLATE "${sourceDb}"`);
    await adminClient.end();

    db = new pg.Client({ connectionString: scratchUrl });
    await db.connect();

    // A temporary tree: the real migrations, schema and config, so the real
    // `prisma migrate deploy` runs without editing any file in the repository.
    tree = mkdtempSync(join(tmpdir(), "ra8388-tree-"));
    cpSync(join(repoRoot, "prisma", "migrations"), join(tree, "prisma", "migrations"), {
      recursive: true,
    });
    cpSync(join(repoRoot, "prisma", "schema.prisma"), join(tree, "prisma", "schema.prisma"));
    cpSync(join(repoRoot, "prisma.config.ts"), join(tree, "prisma.config.ts"));
    cpSync(join(repoRoot, "package.json"), join(tree, "package.json"));
    symlinkSync(join(repoRoot, "node_modules"), join(tree, "node_modules"));
    const substitute = process.env.RA_8388_PROOF_MIGRATION_SQL;
    if (substitute) {
      cpSync(substitute, join(tree, "prisma", "migrations", MIGRATION, "migration.sql"));
    }
  }, 120_000);

  afterAll(async () => {
    await db?.end().catch(() => undefined);
    if (adminUrl) {
      const adminClient = new pg.Client({ connectionString: adminUrl });
      await adminClient.connect();
      await adminClient.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`);
      await adminClient.end();
    }
    if (tree) rmSync(tree, { recursive: true, force: true });
  }, 60_000);

  it("the applied check reads APPLIED, then NOT APPLIED after down.sql, then NOT APPLIED with no ledger row", async () => {
    const after = await appliedCheck();
    save("applied-check-after-migration.txt", after.join("\n"));
    expect(after).toHaveLength(10);
    expect(after[after.length - 1]).toBe("RA-8388 MIGRATION: APPLIED");
    for (const label of OBJECT_LABELS) expect(after).toContain(`${label}: PRESENT`);

    await db.query(readFileSync(join(migrationDir, "down.sql"), "utf8"));
    const afterDown = await appliedCheck();
    save("applied-check-after-down.txt", afterDown.join("\n"));
    const downVerdict = afterDown[afterDown.length - 1];
    expect(downVerdict.startsWith("RA-8388 MIGRATION: NOT APPLIED (")).toBe(true);
    for (const label of OBJECT_LABELS) {
      expect(afterDown).toContain(`${label}: MISSING`);
      expect(downVerdict).toContain(label);
    }
    // down.sql leaves the ledger saying "finished": the check must not be
    // fooled by that, and must not blame the ledger either.
    expect(afterDown[0]).toBe(`ledger row ${MIGRATION} (finished, not rolled back): PRESENT`);
    expect(downVerdict).not.toContain("ledger row");

    // Simulated before state: no objects (down.sql above) and no ledger row.
    await db.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [MIGRATION]);
    const before = await appliedCheck();
    save("applied-check-before-migration-simulated.txt", before.join("\n"));
    expect(before[0]).toBe(`ledger row ${MIGRATION} (no row): MISSING`);
    expect(before[before.length - 1]).toContain(`ledger row ${MIGRATION} (no row)`);
    expect(before[before.length - 1].startsWith("RA-8388 MIGRATION: NOT APPLIED (")).toBe(true);
  }, 60_000);

  it("a held lock makes migrate deploy give up within seconds, create nothing, and stay retryable", async () => {
    // Facts recorded alongside: how the file is run, and whether the timeout leaks.
    probe(
      "20261116120001_ra8388_probe_leak",
      `CREATE TABLE "_ra8388_probe_leak" AS SELECT current_setting('lock_timeout') AS v, pg_backend_pid() AS pid;\n`,
    );
    probe(
      "20261116120002_ra8388_probe_txn",
      `CREATE TABLE "_ra8388_probe_a" AS SELECT txid_current()::text AS x, pg_backend_pid() AS pid;\n` +
        `CREATE TABLE "_ra8388_probe_b" AS SELECT txid_current()::text AS x, pg_backend_pid() AS pid;\n`,
    );

    const holder = new pg.Client({ connectionString: scratchUrl });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query('LOCK TABLE "MoistureReading" IN ACCESS SHARE MODE');
    // Positive control: the lock is really held before the deploy starts.
    const held = await db.query(
      `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
       WHERE c.relname = 'MoistureReading' AND l.granted AND l.pid = $1`,
      [(holder as unknown as { processID: number }).processID],
    );
    expect(held.rows[0].n).toBeGreaterThan(0);

    const blocked = await prisma(["migrate", "deploy"], 45_000);
    await holder.query("ROLLBACK");
    await holder.end();
    fact(
      `deploy behind a held lock: exit=${blocked.code} timedOut=${blocked.timedOut} ms=${blocked.ms}\n${blocked.out}`,
    );
    // The old file has no lock timeout: it waits for as long as the lock is
    // held, which here is until the 45 second limit kills it.
    expect(blocked.timedOut, "deploy waited behind the lock instead of failing fast").toBe(false);
    expect(blocked.code).not.toBe(0);
    expect(blocked.ms).toBeLessThan(20_000);
    expect(blocked.out).toMatch(/lock timeout/i);

    const afterTimeout = await appliedCheck();
    fact(`applied check after the lock timeout:\n${afterTimeout.join("\n")}`);
    for (const label of OBJECT_LABELS) expect(afterTimeout).toContain(`${label}: MISSING`);
    expect(afterTimeout[0]).toBe(
      `ledger row ${MIGRATION} (a failed attempt is not resolved): MISSING`,
    );

    // Until the failed row is resolved, Prisma refuses to deploy at all.
    const refused = await prisma(["migrate", "deploy"], 45_000);
    fact(`deploy again before resolve: exit=${refused.code}\n${refused.out}`);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toMatch(/P3009/);

    const resolved = await prisma(["migrate", "resolve", "--rolled-back", MIGRATION], 45_000);
    expect(resolved.code, resolved.out).toBe(0);
    const retry = await prisma(["migrate", "deploy"], 90_000);
    fact(`retry after resolve --rolled-back: exit=${retry.code}\n${retry.out}`);
    expect(retry.code, retry.out).toBe(0);

    const afterRetry = await appliedCheck();
    expect(afterRetry[afterRetry.length - 1]).toBe("RA-8388 MIGRATION: APPLIED");

    const leak = await db.query('SELECT v, pid FROM "_ra8388_probe_leak"');
    const a = await db.query('SELECT x, pid FROM "_ra8388_probe_a"');
    const b = await db.query('SELECT x, pid FROM "_ra8388_probe_b"');
    fact(
      `lock_timeout seen by the NEXT migration in the same deploy: ${leak.rows[0].v} (backend ${leak.rows[0].pid})`,
    );
    fact(
      `two statements of one file ran as transactions ${a.rows[0].x} then ${b.rows[0].x} (backend ${a.rows[0].pid}, ${b.rows[0].pid})`,
    );
    // The migration's comment says the file is NOT one transaction under
    // prisma migrate deploy. If Prisma changes that, this fails and the
    // comment and the choice of SET over SET LOCAL must be revisited.
    expect(a.rows[0].x).not.toBe(b.rows[0].x);

    // A file whose last statement fails: does the first statement survive?
    probe(
      "20261116120003_ra8388_probe_atomic",
      `CREATE TABLE "_ra8388_probe_c" (i int);\nSELECT 1/0;\n`,
    );
    const failing = await prisma(["migrate", "deploy"], 45_000);
    expect(failing.code).not.toBe(0);
    const survived = await db.query(
      `SELECT to_regclass('"_ra8388_probe_c"') IS NOT NULL AS present`,
    );
    fact(
      `after a file fails on its LAST statement, its FIRST statement's table is present: ${survived.rows[0].present}`,
    );
    expect(survived.rows[0].present).toBe(true);
  }, 300_000);

  it("a timeout part-way leaves a partial apply that down.sql, resolve and a redeploy recover", async () => {
    // Clear the deliberate failure the previous test left in the ledger.
    const cleared = await prisma(
      ["migrate", "resolve", "--rolled-back", "20261116120003_ra8388_probe_atomic"],
      45_000,
    );
    expect(cleared.code, cleared.out).toBe(0);
    rmSync(join(tree, "prisma", "migrations", "20261116120003_ra8388_probe_atomic"), {
      recursive: true,
      force: true,
    });
    await db.query('DROP TABLE IF EXISTS "_ra8388_probe_c"');

    // Back to the simulated before state.
    const downSql = readFileSync(join(migrationDir, "down.sql"), "utf8");
    await db.query(downSql);
    await db.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [MIGRATION]);

    // Lock the table the SECOND statement needs. The first statement commits.
    const holder = new pg.Client({ connectionString: scratchUrl });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query('LOCK TABLE "EnvironmentalData" IN ACCESS SHARE MODE');
    const blocked = await prisma(["migrate", "deploy"], 45_000);
    await holder.query("ROLLBACK");
    await holder.end();
    expect(blocked.timedOut).toBe(false);
    expect(blocked.code).not.toBe(0);
    expect(blocked.out).toMatch(/lock timeout/i);

    const partial = await appliedCheck();
    fact(`applied check after a timeout on the SECOND statement:\n${partial.join("\n")}`);
    save("applied-check-partial-apply.txt", partial.join("\n"));
    expect(partial).toContain("column MoistureReading.evidenceItemId: PRESENT");
    expect(partial).toContain("column EnvironmentalData.evidenceItemId: MISSING");
    expect(partial[partial.length - 1].startsWith("RA-8388 MIGRATION: NOT APPLIED (")).toBe(true);

    // Resolving and redeploying WITHOUT down.sql does not work.
    const resolvedOnly = await prisma(["migrate", "resolve", "--rolled-back", MIGRATION], 45_000);
    expect(resolvedOnly.code, resolvedOnly.out).toBe(0);
    const naive = await prisma(["migrate", "deploy"], 45_000);
    fact(`redeploy after a partial apply WITHOUT down.sql: exit=${naive.code}\n${naive.out}`);
    expect(naive.code).not.toBe(0);
    expect(naive.out).toMatch(/already exists/i);

    // The recovery: down.sql, resolve --rolled-back, deploy.
    await db.query(downSql);
    const resolved = await prisma(["migrate", "resolve", "--rolled-back", MIGRATION], 45_000);
    expect(resolved.code, resolved.out).toBe(0);
    const retry = await prisma(["migrate", "deploy"], 90_000);
    expect(retry.code, retry.out).toBe(0);
    const recovered = await appliedCheck();
    fact(`applied check after down.sql, resolve --rolled-back and redeploy:\n${recovered.join("\n")}`);
    expect(recovered[recovered.length - 1]).toBe("RA-8388 MIGRATION: APPLIED");
  }, 300_000);

  it("down.sql also gives up within seconds behind a held lock and removes nothing", async () => {
    // The recovery above sends an operator to down.sql straight after lock
    // contention, and its drops need the same exclusive locks.
    // Run here as ONE driver batch (one implicit transaction). An operator
    // using psql without --single-transaction runs it statement by statement.
    const downSql = readFileSync(join(migrationDir, "down.sql"), "utf8");
    const holder = new pg.Client({ connectionString: scratchUrl });
    const runner = new pg.Client({ connectionString: scratchUrl });
    await holder.connect();
    await runner.connect();
    await holder.query("BEGIN");
    await holder.query('LOCK TABLE "EnvironmentalData" IN ACCESS SHARE MODE');
    const started = Date.now();
    const pending = runner.query(downSql).then(
      () => "completed" as const,
      (error: { code?: string }) => error,
    );
    const outcome = await Promise.race([
      pending,
      new Promise<"waited">((done) => setTimeout(() => done("waited"), 20_000)),
    ]);
    const ms = Date.now() - started;
    await holder.query("ROLLBACK");
    await holder.end();
    await pending;
    await runner.end();
    fact(
      `down.sql behind a held lock: ${typeof outcome === "string" ? outcome : `error ${outcome.code}`} after ${ms} ms`,
    );
    expect(outcome, "down.sql waited behind the lock instead of failing fast").not.toBe("waited");
    expect(outcome).not.toBe("completed");
    expect((outcome as { code?: string }).code).toBe("55P03");
    expect(ms).toBeLessThan(15_000);
    const still = await appliedCheck();
    expect(still[still.length - 1]).toBe("RA-8388 MIGRATION: APPLIED");
  }, 120_000);

  it("the object pattern for apply mode is silent when applied and matches when an index is missing", async () => {
    const re = new RegExp(RA_8388_ROUNDTRIP_OBJECT_RE);
    const diffArgs = [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ];
    const clean = await prisma(diffArgs, 120_000);
    const cleanLines = clean.out.split("\n");
    // Positive control: the diff says something about this database at all.
    expect(cleanLines.length).toBeGreaterThan(5);
    const cleanHits = cleanLines.filter((line) => re.test(line));
    fact(
      `migrate diff with the migration applied: ${cleanLines.length} lines, ${cleanHits.length} match ${RA_8388_ROUNDTRIP_OBJECT_RE}`,
    );
    expect(cleanHits).toEqual([]);

    for (const [drop, mustName] of [
      ['DROP INDEX "EvidenceItem_signed_capture_key"', "EvidenceItem_signed_capture_key"],
      ['DROP INDEX "MoistureReading_evidenceItemId_key"', "MoistureReading_evidenceItemId_key"],
      [
        'ALTER TABLE "EnvironmentalData" DROP CONSTRAINT "EnvironmentalData_evidenceItemId_fkey"',
        "EnvironmentalData_evidenceItemId_fkey",
      ],
    ] as const) {
      await db.query(drop);
      const drifted = await prisma(diffArgs, 120_000);
      const hits = drifted.out.split("\n").filter((line) => re.test(line));
      fact(`after ${drop}: diff lines matching the pattern:\n${hits.join("\n")}`);
      expect(hits.join("\n")).toContain(mustName);
    }
  }, 600_000);
});
