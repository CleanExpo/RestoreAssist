/**
 * RA-8498 rollback: prisma/migrations/20261121150000_ra_8498_site_visit/down.sql
 * must remove every object the forward migration adds, and nothing else.
 *
 * Two layers (same shape as ra-8495-rollback.test.ts):
 *   1. Static, always runs: the objects scripts/ci/sql_list_added_objects.py
 *      reads from migration.sql (the lister migration-roundtrip.sh uses), plus
 *      each CREATE TABLE and CREATE TYPE, must each have a matching drop in
 *      down.sql, and down.sql must drop nothing else.
 *   2. On Postgres (DATABASE_URL, as `npm run test:db` and CI's unit job set
 *      it): the front-photo key is NO ACTION and the job key cascades, then,
 *      inside one transaction that is rolled back, every object is present
 *      (the positive control), down.sql runs, and every object is gone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const repoRoot = resolve(__dirname, "..", "..", "..");
const dir = join(repoRoot, "prisma", "migrations", "20261121150000_ra_8498_site_visit");
const forward = readFileSync(join(dir, "migration.sql"), "utf8");
const down = readFileSync(join(dir, "down.sql"), "utf8");

type Obj = { kind: "column" | "index" | "constraint" | "table" | "type"; table: string; name: string };
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
  const code = stripComments(forward);
  for (const m of code.matchAll(/CREATE TABLE "([^"]+)"/g)) listed.push({ kind: "table", table: m[1], name: m[1] });
  for (const m of code.matchAll(/CREATE TYPE "([^"]+)"/g)) listed.push({ kind: "type", table: "", name: m[1] });
  return listed;
}

function droppedObjects(sql: string): Obj[] {
  const out: Obj[] = [];
  for (const raw of stripComments(sql).split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const alter = /^ALTER TABLE "([^"]+)"/.exec(stmt);
    if (alter) {
      for (const m of stmt.matchAll(/DROP COLUMN IF EXISTS "([^"]+)"/g)) out.push({ kind: "column", table: alter[1], name: m[1] });
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
    m = /^DROP TYPE IF EXISTS "([^"]+)"$/.exec(stmt);
    if (m) {
      out.push({ kind: "type", table: "", name: m[1] });
      continue;
    }
    if (/^SET lock_timeout = '\d+s'$/.test(stmt)) continue;
    throw new Error(`down.sql statement this test does not recognise: ${stmt}`);
  }
  return out;
}

/** Index drops name no table; match them to the forward migration's index by name. */
function normalise(objs: Obj[]): string[] {
  return objs.map((o) => key(o.kind === "index" ? { ...o, table: "*" } : o)).sort();
}

describe("RA-8498 migration (static)", () => {
  it("is additive: it alters, drops or renames nothing that existed before", () => {
    const code = stripComments(forward);
    for (const stmt of code.split(";").map((s) => s.trim()).filter(Boolean)) {
      const alter = /^ALTER TABLE "([^"]+)"/.exec(stmt);
      if (alter) expect(alter[1], stmt).toBe("SiteVisit");
      expect(stmt, stmt).not.toMatch(/\bDROP\b|\bRENAME\b/i);
    }
  });

  it("keeps the front photo key NO ACTION and the job key CASCADE", () => {
    expect(forward).toMatch(/"SiteVisit_frontPhotoId_fkey" FOREIGN KEY \("frontPhotoId"\) REFERENCES "InspectionPhoto"\("id"\) ON DELETE NO ACTION/);
    expect(forward).toMatch(/"SiteVisit_inspectionId_fkey" FOREIGN KEY \("inspectionId"\) REFERENCES "Inspection"\("id"\) ON DELETE CASCADE/);
  });
});

describe("RA-8498 down.sql (static)", () => {
  it("drops every object the migration adds, and nothing else", () => {
    const added = addedObjects();
    expect(added.length).toBe(11);
    expect(normalise(droppedObjects(down))).toEqual(normalise(added));
  });

  it("drops dependants before what they depend on", () => {
    const order = droppedObjects(down).map(key);
    const pos = (k: string) => order.findIndex((o) => o.endsWith(k));
    expect(pos("\tSiteVisit_frontPhotoId_fkey")).toBeLessThan(pos("\tSiteVisit\tSiteVisit"));
    expect(pos("\tSiteVisit\tSiteVisit")).toBeLessThan(pos("\tSiteVisitPresence"));
    expect(pos("\tSiteVisit\tSiteVisit")).toBeLessThan(pos("\tSiteVisitEquipmentOutcome"));
  });
});

describe.skipIf(!process.env.DATABASE_URL)("RA-8498 migration on Postgres", () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  beforeAll(async () => {
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });

  async function present(o: Obj): Promise<boolean> {
    switch (o.kind) {
      case "column": {
        const r = await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2",
          [o.table, o.name],
        );
        return r.rowCount === 1;
      }
      case "index":
      case "table": {
        const r = await db.query("SELECT to_regclass(quote_ident($1)) IS NOT NULL AS ok", [o.name]);
        return r.rows[0].ok === true;
      }
      case "constraint": {
        const r = await db.query("SELECT 1 FROM pg_constraint WHERE conname = $1", [o.name]);
        return (r.rowCount ?? 0) > 0;
      }
      case "type": {
        const r = await db.query("SELECT to_regtype(quote_ident($1)) IS NOT NULL AS ok", [o.name]);
        return r.rows[0].ok === true;
      }
    }
  }

  it("the applied keys have the delete actions the migration declares", async () => {
    const r = await db.query(
      "SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('SiteVisit_frontPhotoId_fkey', 'SiteVisit_inspectionId_fkey') ORDER BY conname",
    );
    // pg_constraint.confdeltype: 'a' = NO ACTION, 'c' = CASCADE.
    expect(r.rows).toEqual([
      { conname: "SiteVisit_frontPhotoId_fkey", confdeltype: "a" },
      { conname: "SiteVisit_inspectionId_fkey", confdeltype: "c" },
    ]);
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
