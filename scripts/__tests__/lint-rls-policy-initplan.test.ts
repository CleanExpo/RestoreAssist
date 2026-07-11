/**
 * WS4 — RLS InitPlan forward-guard tests (RA-1807 remediation spec §14, AC-16/AC-17).
 *
 * Always-green static layer: proves the guard rejects a bare `auth.*()` policy
 * predicate and accepts the `(select auth.*())` form, in BOTH migration roots
 * (adversarial-verify AV-1), and never flags a non-RLS migration.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — pure ESM helper module, no type declarations.
import {
  findUnwrappedAuthCalls,
  definesPolicy,
  lintSql,
  isMigrationSql,
  MIGRATION_ROOTS,
} from "../lint-rls-policy-initplan.mjs";

const BARE = `CREATE POLICY "ra9999_select" ON public."Widget"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());`;

const WRAPPED = `CREATE POLICY "ra9999_select" ON public."Widget"
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));`;

const MIXED = `CREATE POLICY "ra9999_all" ON public."Widget"
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (owner = auth.uid() AND tenant = (select auth.jwt()));`;

const NON_POLICY = `CREATE TABLE "Widget" (id uuid primary key, note text);
GRANT SELECT ON "Widget" TO authenticated;`;

describe("WS4 RLS InitPlan forward-guard", () => {
  describe("findUnwrappedAuthCalls (pure)", () => {
    it("flags a bare auth.uid() predicate", () => {
      const o = findUnwrappedAuthCalls(BARE);
      expect(o).toHaveLength(1);
      expect(o[0].fn).toBe("auth.uid()");
    });

    it("accepts a (select auth.uid()) predicate", () => {
      expect(findUnwrappedAuthCalls(WRAPPED)).toHaveLength(0);
    });

    it("flags only the bare call in a mixed policy, not the wrapped ones", () => {
      const o = findUnwrappedAuthCalls(MIXED);
      // owner = auth.uid() is bare; the two (select …) forms are safe.
      expect(o).toHaveLength(1);
      expect(o[0].snippet).toContain("owner = auth.uid()");
    });

    it("wraps every zero-arg auth family member", () => {
      for (const fn of ["uid", "role", "jwt", "email"]) {
        expect(
          findUnwrappedAuthCalls(`USING (x = auth.${fn}())`),
        ).toHaveLength(1);
        expect(
          findUnwrappedAuthCalls(`USING (x = (select auth.${fn}()))`),
        ).toHaveLength(0);
      }
    });

    it("tolerates whitespace inside the wrap and the call", () => {
      expect(
        findUnwrappedAuthCalls("USING ( x = ( SELECT   auth.uid( ) ) )"),
      ).toHaveLength(0);
    });

    it("ignores auth.uid() mentioned only in a -- comment (the RA-4827 exemplar)", () => {
      const sql = `-- RA-4827: wrap auth.uid() in (select auth.uid()) for InitPlan.
ALTER POLICY "p" ON "T" USING (uid = (select auth.uid()));`;
      expect(findUnwrappedAuthCalls(sql)).toHaveLength(0);
    });

    it("ignores auth.uid() inside a /* block comment */", () => {
      const sql = `/* legacy predicate was: uid = auth.uid() (bare) */
USING (uid = (select auth.uid()))`;
      expect(findUnwrappedAuthCalls(sql)).toHaveLength(0);
    });

    it("STILL flags a bare predicate built inside a format('…') emitter string", () => {
      const sql = `pred := format('%I = auth.uid()::text', col);`;
      const o = findUnwrappedAuthCalls(sql);
      expect(o).toHaveLength(1);
      expect(o[0].fn).toBe("auth.uid()");
    });

    it("reports the correct line number despite preceding comments", () => {
      const sql = `-- line 1 comment auth.uid()
-- line 2 comment
USING (uid = auth.uid())`;
      const o = findUnwrappedAuthCalls(sql);
      expect(o).toHaveLength(1);
      expect(o[0].line).toBe(3);
    });
  });

  describe("lintSql (policy-context gate)", () => {
    it("rejects a bare policy in a prisma/migrations file", () => {
      const out = lintSql(
        BARE,
        "prisma/migrations/20990101000000_new/migration.sql",
      );
      expect(out).toHaveLength(1);
      expect(out[0].file).toContain("prisma/migrations");
    });

    it("rejects a bare policy in a supabase/migrations file", () => {
      const out = lintSql(BARE, "supabase/migrations/20990101000000_new.sql");
      expect(out).toHaveLength(1);
      expect(out[0].file).toContain("supabase/migrations");
    });

    it("accepts a wrapped policy", () => {
      expect(lintSql(WRAPPED, "supabase/migrations/x.sql")).toHaveLength(0);
    });

    it("never flags a non-RLS migration even with a bare auth call elsewhere", () => {
      expect(lintSql(NON_POLICY, "prisma/migrations/x/migration.sql")).toEqual(
        [],
      );
      expect(
        lintSql("SELECT auth.uid();", "prisma/migrations/x/migration.sql"),
      ).toEqual([]);
    });

    it("detects emitter-built predicates (pg_temp.policy_* / rask_*)", () => {
      const emitter = `SELECT pg_temp.policy_user_owned('Widget', 'user_id = auth.uid()');`;
      expect(definesPolicy(emitter)).toBe(true);
      expect(lintSql(emitter, "prisma/migrations/x/migration.sql")).toHaveLength(
        1,
      );
    });
  });

  describe("dual-root scoping (AV-1)", () => {
    it("recognises both migration roots", () => {
      expect(MIGRATION_ROOTS).toContain("prisma/migrations");
      expect(MIGRATION_ROOTS).toContain("supabase/migrations");
    });

    it("classifies .sql under either root as a migration; ignores others", () => {
      expect(
        isMigrationSql("prisma/migrations/20990101_x/migration.sql"),
      ).toBe(true);
      expect(isMigrationSql("supabase/migrations/20990101_x.sql")).toBe(true);
      // Windows-style separators normalise too.
      expect(
        isMigrationSql("prisma\\migrations\\20990101_x\\migration.sql"),
      ).toBe(true);
      expect(isMigrationSql("scripts/build.sh")).toBe(false);
      expect(isMigrationSql("prisma/schema.prisma")).toBe(false);
    });
  });
});
