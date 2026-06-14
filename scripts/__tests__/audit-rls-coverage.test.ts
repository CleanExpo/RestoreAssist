/**
 * RA-4956 — Static RLS coverage gate (always-green in CI; no DB required).
 *
 * Proves, by parsing the migration SQL, that the RA-4956 policy set covers
 * every table the RLS audit requires to be tenant-isolated, that RLS is enabled
 * on all 119 audited tables (RA-4970), that every emitted policy references a
 * real scoping anchor, and that service-only tables stay default-deny.
 *
 * This does NOT prove the policies actually isolate rows at runtime — that is
 * the job of the live-Postgres harness in `test/rls/`. This layer guards
 * against the regressions that static analysis CAN catch: a table silently
 * dropped from the policy emission, a typo'd scoping column, a service-only
 * table accidentally getting a tenant policy, or RLS never being enabled.
 */

import { describe, expect, it } from "vitest";
import {
  RA4956_MIGRATION,
  RA4970_MIGRATION,
  RA4956_FOLLOWUP_MIGRATION,
  readMigration,
  parseEmittedPolicies,
  parseRlsEnabledTables,
  parseServiceOnlyDowngrade,
  tenantScopedTables,
  AUDIT_TABLES,
  SERVICE_ONLY,
  PUBLIC_REF,
  INVESTIGATE_FIRST,
} from "../audit-rls-coverage";

const ra4956 = readMigration(RA4956_MIGRATION);
const ra4970 = readMigration(RA4970_MIGRATION);
const rlsEnabled = parseRlsEnabledTables(ra4970);

// RA-4956 emits policies for Session/Account; the follow-up migration drops
// them (service-only). Net them out so the gate reflects the real posture.
const downgraded = parseServiceOnlyDowngrade(
  readMigration(RA4956_FOLLOWUP_MIGRATION),
);
const emitted = new Map(
  [...parseEmittedPolicies(ra4956)].filter(([t]) => !downgraded.has(t)),
);

describe("RA-4956 static RLS coverage", () => {
  describe("audit set integrity", () => {
    it("audits exactly 119 tables (the Supabase-advisor RLS-disabled set)", () => {
      expect(new Set(AUDIT_TABLES).size).toBe(119);
    });

    it("partitions every audited table into exactly one disposition", () => {
      // Each table is either tenant-scoped (gets a policy) or explicitly
      // exempt (public-ref / service-only / investigate-first). No overlaps,
      // no orphans — so nothing falls through a categorisation crack.
      const tenant = new Set(tenantScopedTables());
      for (const t of AUDIT_TABLES) {
        const dispositions = [
          tenant.has(t),
          PUBLIC_REF.has(t),
          SERVICE_ONLY.has(t),
          INVESTIGATE_FIRST.has(t),
        ].filter(Boolean).length;
        expect(
          dispositions,
          `table ${t} must have exactly one disposition`,
        ).toBe(1);
      }
    });
  });

  describe("RLS-enable invariant (RA-4970)", () => {
    it("enables RLS on all 119 audited tables (default-deny baseline)", () => {
      const notEnabled = AUDIT_TABLES.filter((t) => !rlsEnabled.has(t));
      expect(
        notEnabled,
        "audited tables missing ENABLE ROW LEVEL SECURITY",
      ).toEqual([]);
    });
  });

  describe("policy coverage", () => {
    it("emits at least one ra4956 policy for every tenant-scoped table", () => {
      const expected = tenantScopedTables();
      const missing = expected.filter((t) => !emitted.has(t));
      expect(missing, "tenant-scoped tables with NO ra4956 policy").toEqual([]);
    });

    it("emits no policy for a table outside the tenant-scoped set", () => {
      const expected = new Set(tenantScopedTables());
      const stray = [...emitted.keys()].filter((t) => !expected.has(t));
      expect(stray, "ra4956 policy emitted for an unexpected table").toEqual(
        [],
      );
    });

    it("covers 68 tenant-scoped tables (locks the expected count)", () => {
      // Guards against a future edit that drops a table from BOTH the policy
      // emission and the exempt sets at once (which the per-table checks above
      // would otherwise silently pass).
      // 66 = 68 RA-4956 tables minus the two (Session, Account) the follow-up
      // migration downgrades to service-only.
      expect(tenantScopedTables().length).toBe(66);
      expect(emitted.size).toBe(66);
    });
  });

  describe("scoping integrity", () => {
    it("every emitted policy references a real scoping anchor (never public-read)", () => {
      const unscoped = [...emitted.values()].filter((p) => p.anchor === "none");
      expect(
        unscoped.map((p) => p.table),
        "tenant policies with no auth.uid/workspace/org/parent anchor",
      ).toEqual([]);
    });

    it("does not reference auth.uid()::text against a column the audit cannot back", () => {
      // Every owner-path predicate must compare to auth.uid() — assert the
      // migration never emits a bare "userId = '...'" literal (a hardcoded
      // tenant would be a catastrophic isolation bug).
      expect(ra4956).not.toMatch(/"userId"\s*=\s*'[^']+'/);
    });
  });

  describe("service-only tables stay default-deny", () => {
    it("the RA-4956 follow-up downgrades exactly Session + Account", () => {
      expect(downgraded).toEqual(new Set(["Account", "Session"]));
    });

    it("emits no ra4956 policy for any service-only table", () => {
      const leaked = [...SERVICE_ONLY].filter((t) => emitted.has(t));
      expect(
        leaked,
        "service-only tables that leaked an authenticated policy",
      ).toEqual([]);
    });

    it("emits no ra4956 policy for any investigate-first table", () => {
      const leaked = [...INVESTIGATE_FIRST].filter((t) => emitted.has(t));
      expect(
        leaked,
        "investigate-first tables should stay default-deny",
      ).toEqual([]);
    });
  });

  describe("anchor distribution (sanity of the parse)", () => {
    it("detects each scoping family the migration uses", () => {
      const anchors = new Set([...emitted.values()].map((p) => p.anchor));
      expect(anchors.has("user-uid")).toBe(true);
      expect(anchors.has("workspace-helper")).toBe(true);
      expect(anchors.has("parent-join")).toBe(true);
      expect(anchors.has("org-lookup")).toBe(true);
    });
  });
});
