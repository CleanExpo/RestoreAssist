/**
 * RA-8496 rollback: prisma/migrations/20261121120000_ra_8496_job_notes/down.sql
 * must remove every object the forward migration adds, and nothing else.
 *
 * Two layers, like ra-8495-rollback.test.ts:
 *   1. Static, always runs: the table, trigger function and enum the forward
 *      migration creates each have a matching drop in down.sql, in dependency
 *      order, and down.sql drops nothing else.
 *   2. On Postgres (DATABASE_URL, as `npm run test:db` and CI's unit job set
 *      it): inside one transaction that is rolled back, every added object,
 *      including the indexes, foreign keys and trigger that go with the table,
 *      is present (the positive control), down.sql runs, and every one is gone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const repoRoot = resolve(__dirname, "..", "..", "..");
const dir = join(
  repoRoot,
  "prisma",
  "migrations",
  "20261121120000_ra_8496_job_notes",
);
const forward = readFileSync(join(dir, "migration.sql"), "utf8");
const down = readFileSync(join(dir, "down.sql"), "utf8");

type Kind = "index" | "constraint" | "table" | "type" | "function" | "trigger";
type Obj = { kind: Kind; table: string; name: string };
const key = (o: Obj) => `${o.kind}\t${o.table}\t${o.name}`;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Top-level objects: the ones down.sql must name. */
function createdTopLevel(): Obj[] {
  const code = stripComments(forward);
  const out: Obj[] = [];
  for (const m of code.matchAll(/CREATE TABLE "([^"]+)"/g))
    out.push({ kind: "table", table: m[1], name: m[1] });
  for (const m of code.matchAll(/CREATE TYPE "([^"]+)"/g))
    out.push({ kind: "type", table: "", name: m[1] });
  for (const m of code.matchAll(
    /CREATE (?:OR REPLACE )?FUNCTION "([^"]+)"\(\)/g,
  ))
    out.push({ kind: "function", table: "", name: m[1] });
  return out;
}

/** Every object the migration adds, top level or carried by the table. */
function addedObjects(): Obj[] {
  const run = spawnSync(
    "python3",
    ["scripts/ci/sql_list_added_objects.py", join(dir, "migration.sql")],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (run.status !== 0)
    throw new Error(
      `sql_list_added_objects.py exit ${run.status}: ${run.stderr}`,
    );
  const listed = run.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [kind, table, name] = line.split("\t");
      return { kind, table, name } as Obj;
    });
  const code = stripComments(forward);
  for (const m of code.matchAll(/CREATE TRIGGER "([^"]+)"\s+[^;]*? ON "([^"]+)"/g))
    listed.push({ kind: "trigger", table: m[2], name: m[1] });
  return [...listed, ...createdTopLevel()];
}

function droppedObjects(sql: string): Obj[] {
  const out: Obj[] = [];
  for (const raw of stripComments(sql).split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    let m = /^DROP TABLE IF EXISTS "([^"]+)"$/.exec(stmt);
    if (m) {
      out.push({ kind: "table", table: m[1], name: m[1] });
      continue;
    }
    m = /^DROP FUNCTION IF EXISTS "([^"]+)"\(\)$/.exec(stmt);
    if (m) {
      out.push({ kind: "function", table: "", name: m[1] });
      continue;
    }
    m = /^DROP TYPE IF EXISTS "([^"]+)"$/.exec(stmt);
    if (m) {
      out.push({ kind: "type", table: "", name: m[1] });
      continue;
    }
    if (/^SET lock_timeout = '\d+s'$/.test(stmt)) continue;
    throw new Error(
      `down.sql statement this test does not recognise: ${stmt}`,
    );
  }
  return out;
}

describe("RA-8496 down.sql (static)", () => {
  it("drops the table, the trigger function and the enum the migration creates, and nothing else", () => {
    const created = createdTopLevel().map(key).sort();
    expect(created).toEqual(
      [
        key({ kind: "table", table: "JobNote", name: "JobNote" }),
        key({ kind: "type", table: "", name: "JobNoteKind" }),
        key({ kind: "function", table: "", name: "job_note_append_only" }),
      ].sort(),
    );
    expect(droppedObjects(down).map(key).sort()).toEqual(created);
  });

  it("drops the table before the function its trigger uses and the enum its column uses", () => {
    const order = droppedObjects(down).map((o) => o.name);
    expect(order.indexOf("JobNote")).toBeLessThan(
      order.indexOf("job_note_append_only"),
    );
    expect(order.indexOf("JobNote")).toBeLessThan(order.indexOf("JobNoteKind"));
  });
});

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-8496 down.sql on Postgres",
  () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    beforeAll(async () => {
      await db.connect();
    });
    afterAll(async () => {
      await db.end();
    });

    async function present(o: Obj): Promise<boolean> {
      switch (o.kind) {
        case "index":
        case "table": {
          const r = await db.query(
            "SELECT to_regclass(quote_ident($1)) IS NOT NULL AS ok",
            [o.name],
          );
          return r.rows[0].ok === true;
        }
        case "constraint": {
          const r = await db.query(
            "SELECT 1 FROM pg_constraint WHERE conname = $1",
            [o.name],
          );
          return (r.rowCount ?? 0) > 0;
        }
        case "type": {
          const r = await db.query(
            "SELECT to_regtype(quote_ident($1)) IS NOT NULL AS ok",
            [o.name],
          );
          return r.rows[0].ok === true;
        }
        case "function": {
          const r = await db.query(
            "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = current_schema() AND p.proname = $1",
            [o.name],
          );
          return (r.rowCount ?? 0) > 0;
        }
        case "trigger": {
          const r = await db.query(
            "SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal",
            [o.name],
          );
          return (r.rowCount ?? 0) > 0;
        }
      }
    }

    it("every added object is present, then gone after down.sql (rolled back)", async () => {
      const added = addedObjects();
      // 3 indexes, 2 foreign keys, 1 trigger, the table, the function, the enum.
      expect(added).toHaveLength(9);
      await db.query("BEGIN");
      try {
        for (const o of added)
          expect(await present(o), `before down.sql: ${key(o)}`).toBe(true);
        await db.query(down);
        for (const o of added)
          expect(await present(o), `after down.sql: ${key(o)}`).toBe(false);
      } finally {
        await db.query("ROLLBACK");
      }
      for (const o of added)
        expect(await present(o), `after ROLLBACK: ${key(o)}`).toBe(true);
    });
  },
);
