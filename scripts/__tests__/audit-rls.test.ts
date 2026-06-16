/**
 * CI gate for scripts/audit-rls.ts (goal #18). Runs in the always-green unit
 * suite — no DB required. It proves the standalone RLS auditor reports a clean
 * bill of health against the committed migrations, so any regression that
 * breaks coverage or reverts a 2026-06-16 hardening migration fails here.
 */
import { describe, expect, it } from "vitest";
import { runRlsAudit } from "../audit-rls";

describe("audit-rls standalone gate", () => {
  const result = runRlsAudit();

  it("passes with zero failures against the committed migrations", () => {
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("checks coverage (RLS-enable + tenant-scoped policy presence)", () => {
    const coverage = result.report.find((l) => l.startsWith("Coverage:"));
    expect(coverage).toBeTruthy();
    // 119 audited tables, 66 tenant-scoped policies (Session/Account downgraded).
    expect(coverage).toMatch(/119 audited/);
    expect(coverage).toMatch(/66 policies emitted/);
  });

  it("regression-guards all three 2026-06-16 hardening migrations", () => {
    const guards = result.report.filter((l) => l.startsWith("Guard "));
    expect(guards).toHaveLength(3);
    // every guard reports all its invariants intact (N/N)
    for (const g of guards) {
      const [, intact, total] = g.match(/(\d+)\/(\d+) invariant/) ?? [];
      expect(intact).toBe(total);
    }
  });
});
