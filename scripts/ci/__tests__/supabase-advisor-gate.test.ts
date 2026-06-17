import { describe, expect, it } from "vitest";
import { evaluateAdvisors, type AdvisorLint } from "../supabase-advisor-gate";

// Mirrors the real prod advisor shape (restoreassist-prod-2026): only INFO/WARN.
const GREEN_FIXTURE: AdvisorLint[] = [
  ...Array.from({ length: 112 }, (_, i) => ({
    name: "rls_enabled_no_policy",
    level: "INFO" as const,
    title: `table_${i}`,
  })),
  { name: "extension_in_public", level: "WARN" },
  { name: "auth_leaked_password_protection", level: "WARN" },
  { name: "anon_security_definer_function_executable", level: "WARN" },
];

const RED_FIXTURE: AdvisorLint[] = [
  { name: "rls_enabled_no_policy", level: "INFO" },
  {
    name: "rls_disabled_in_public",
    level: "ERROR",
    title: "public.leaky_table",
  },
  { name: "policy_exists_rls_disabled", level: "ERROR" },
];

describe("evaluateAdvisors", () => {
  it("passes when there are no ERROR advisors and no RLS-disabled public tables", () => {
    const result = evaluateAdvisors(GREEN_FIXTURE);
    expect(result.passed).toBe(true);
    expect(result.failing).toHaveLength(0);
    expect(result.counts).toEqual({ INFO: 112, WARN: 3 });
  });

  it("fails on any ERROR-level advisor", () => {
    const result = evaluateAdvisors(RED_FIXTURE);
    expect(result.passed).toBe(false);
    expect(result.failing.map((l) => l.name)).toEqual(
      expect.arrayContaining([
        "rls_disabled_in_public",
        "policy_exists_rls_disabled",
      ]),
    );
  });

  it("fails on an RLS-disabled public table even if Supabase grades it below ERROR", () => {
    const result = evaluateAdvisors([
      { name: "rls_disabled_in_public", level: "WARN", title: "public.sneaky" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.failing).toHaveLength(1);
  });

  it("treats an empty advisor set as passing", () => {
    const result = evaluateAdvisors([]);
    expect(result.passed).toBe(true);
    expect(result.failing).toHaveLength(0);
  });
});
