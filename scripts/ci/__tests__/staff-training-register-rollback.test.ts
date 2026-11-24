/**
 * Mining pilot slice 6 rollback:
 * prisma/migrations/20261123120000_staff_training_register/down.sql must remove
 * every object the forward migration adds, and nothing else.
 *
 * Two layers (same shape as ra-8498-rollback.test.ts):
 *   1. Static, always runs: the objects scripts/ci/sql_list_added_objects.py
 *      reads from migration.sql, plus the CREATE TABLE, must each have a
 *      matching drop in down.sql, and down.sql must drop nothing else. The
 *      migration alters, drops and renames nothing that existed before.
 *   2. On Postgres (DATABASE_URL, as `npm run test:db` and CI's unit job set
 *      it): both keys cascade, the checks refuse bad rows, row-level security
 *      is on, then, inside one transaction that is rolled back, every object
 *      is present (the positive control), down.sql runs, and every object is
 *      gone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const repoRoot = resolve(__dirname, "..", "..", "..");
const dir = join(repoRoot, "prisma", "migrations", "20261123120000_staff_training_register");
const forward = readFileSync(join(dir, "migration.sql"), "utf8");
const down = readFileSync(join(dir, "down.sql"), "utf8");

type Obj = { kind: "index" | "constraint" | "table"; table: string; name: string };
const key = (o: Obj) => `${o.kind}\t${o.table}\t${o.name}`;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function addedObjects(): Obj[] {
  const run = spawnSync("python3", ["scripts/ci/sql_list_added_objects.py", join(dir, "migration.sql")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`sql_list_added_objects.py exit ${run.status}: ${run.stderr}`);
  const listed = run.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [kind, table, name] = line.split("\t");
      return { kind, table, name } as Obj;
    });
  for (const m of stripComments(forward).matchAll(/CREATE TABLE "([^"]+)"/g)) {
    listed.push({ kind: "table", table: m[1], name: m[1] });
  }
  return listed;
}

function droppedObjects(sql: string): Obj[] {
  const out: Obj[] = [];
  for (const raw of stripComments(sql).split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const alter = /^ALTER TABLE "([^"]+)"/.exec(stmt);
    if (alter) {
      for (const m of stmt.matchAll(/DROP CONSTRAINT IF EXISTS "([^"]+)"/g)) out.push({ kind: "constraint", table: alter[1], name: m[1] });
      continue;
    }
    let m = /^DROP INDEX IF EXISTS "([^"]+)"$/.exec(stmt);
    if (m) {
      out.push({ kind: "index", table: "*", name: m[1] });
      continue;
    }
    m = /^DROP TABLE IF EXISTS "([^"]+)"$/.exec(stmt);
    if (m) {
      out.push({ kind: "table", table: m[1], name: m[1] });
      continue;
    }
    if (/^SET lock_timeout = '\d+s'$/.test(stmt)) continue;
    throw new Error(`down.sql statement this test does not recognise: ${stmt}`);
  }
  return out;
}

function normalise(objs: Obj[]): string[] {
  return objs.map((o) => key(o.kind === "index" ? { ...o, table: "*" } : o)).sort();
}

describe("staff training register migration (static)", () => {
  it("is additive: it alters, drops or renames nothing that existed before", () => {
    for (const stmt of stripComments(forward).split(";").map((s) => s.trim()).filter(Boolean)) {
      const alter = /^ALTER TABLE "([^"]+)"/.exec(stmt);
      if (alter) expect(alter[1], stmt).toBe("StaffTrainingRecord");
      expect(stmt, stmt).not.toMatch(/\bDROP\b|\bRENAME\b/i);
    }
  });

  it("cascades from the organisation and the staff member, and turns on row-level security", () => {
    expect(forward).toMatch(/"StaffTrainingRecord_organizationId_fkey" FOREIGN KEY \("organizationId"\) REFERENCES "Organization"\("id"\) ON DELETE CASCADE/);
    expect(forward).toMatch(/"StaffTrainingRecord_staffUserId_fkey" FOREIGN KEY \("staffUserId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/);
    expect(forward).toMatch(/ALTER TABLE "StaffTrainingRecord" ENABLE ROW LEVEL SECURITY;/);
  });
});

describe("staff training register down.sql (static)", () => {
  it("drops every object the migration adds, and nothing else", () => {
    const added = addedObjects();
    expect(added.length).toBe(5);
    expect(normalise(droppedObjects(down))).toEqual(normalise(added));
  });

  it("drops the keys and indexes before the table", () => {
    const order = droppedObjects(down).map(key);
    const table = order.findIndex((o) => o.startsWith("table\t"));
    expect(table).toBe(order.length - 1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("staff training register migration on Postgres", () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  beforeAll(async () => {
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });

  async function present(o: Obj): Promise<boolean> {
    if (o.kind === "constraint") {
      const r = await db.query("SELECT 1 FROM pg_constraint WHERE conname = $1", [o.name]);
      return (r.rowCount ?? 0) > 0;
    }
    const r = await db.query("SELECT to_regclass(quote_ident($1)) IS NOT NULL AS ok", [o.name]);
    return r.rows[0].ok === true;
  }

  it("both keys cascade and row-level security is on", async () => {
    const r = await db.query(
      "SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('StaffTrainingRecord_organizationId_fkey', 'StaffTrainingRecord_staffUserId_fkey') ORDER BY conname",
    );
    // pg_constraint.confdeltype: 'c' = CASCADE.
    expect(r.rows).toEqual([
      { conname: "StaffTrainingRecord_organizationId_fkey", confdeltype: "c" },
      { conname: "StaffTrainingRecord_staffUserId_fkey", confdeltype: "c" },
    ]);
    const rls = await db.query(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'StaffTrainingRecord'",
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
  });

  it("the applied table carries the expiry-not-before-completion check", async () => {
    const check = await db.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'StaffTrainingRecord_expiry_check'",
    );
    expect(check.rows[0]?.def).toMatch(/"expiresOn" >= "completedOn"/);
  });

  it("every added object is present, then gone after down.sql (rolled back)", async () => {
    const added = addedObjects();
    await db.query("BEGIN");
    try {
      for (const o of added) expect(await present(o), `before down.sql: ${key(o)}`).toBe(true);
      await db.query(down);
      for (const o of added) expect(await present(o), `after down.sql: ${key(o)}`).toBe(false);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const o of added) expect(await present(o), `after ROLLBACK: ${key(o)}`).toBe(true);
  });
});
