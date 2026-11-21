/**
 * A library main() resolves to its exit status; it never ends the caller's
 * process (RA-7785, #2595 review). Each case is a refusal the CLI reaches before
 * any network or database call, so the suite needs no key and no connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = { ...process.env };

beforeEach(() => {
  // process.exit inside a library main() would end the test run; make it loud.
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code}) called from a library main()`);
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...SAVED };
  process.exitCode = undefined;
});

const CASES: Array<[string, () => Promise<{ main: () => Promise<number> }>, string, string | undefined, number]> = [
  ["a3 without LINEAR_API_KEY", () => import("../ci/producers/lib/a3-open-blockers"), "LINEAR_API_KEY", undefined, 2],
  ["d1 without STRIPE_TEST_SECRET_KEY", () => import("../ci/producers/lib/d1-billing-flows"), "STRIPE_TEST_SECRET_KEY", undefined, 2],
  ["d3 without STRIPE_SECRET_KEY", () => import("../ci/producers/lib/d3-revenue-reconciliation"), "STRIPE_SECRET_KEY", undefined, 2],
  ["f1 with a blank GITHUB_TOKEN", () => import("../ci/producers/lib/f1-monitoring-alerting"), "GITHUB_TOKEN", "   ", 2],
  ["linear-query without LINEAR_API_KEY", () => import("../lib/linear-query"), "LINEAR_API_KEY", undefined, 1],
  ["supabase-advisor-gate without a token", () => import("../ci/lib/supabase-advisor-gate"), "SUPABASE_ACCESS_TOKEN", undefined, 1],
];

describe("library main() returns its status", () => {
  for (const [name, load, key, value, code] of CASES) {
    it(name, async () => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      const { main } = await load();
      await expect(main()).resolves.toBe(code);
      expect(process.exit).not.toHaveBeenCalled();
    });
  }

  it("does not report a status left behind by earlier work in the same process", async () => {
    // A host that already set exitCode = 1 must not see it echoed back as the
    // result of this run: main() reports what *it* found.
    process.env.SUPABASE_ACCESS_TOKEN = "";
    process.exitCode = 7;
    const { main } = await import("../ci/lib/supabase-advisor-gate");
    await expect(main()).resolves.toBe(1);
  });

  it("a1 without --report is a usage error (2)", async () => {
    const { main } = await import("../ci/producers/lib/a1-core-journeys");
    await expect(main()).resolves.toBe(2);
    expect(process.exit).not.toHaveBeenCalled();
  });
});

describe("audit-env does not scan its own rule table", () => {
  it("has no finding in the moved implementation or its entry", async () => {
    const { auditEnv } = await import("../lib/audit-env");
    const report = JSON.stringify(auditEnv());
    expect(report).not.toContain("scripts/lib/audit-env.ts");
    expect(report).not.toContain("scripts/audit-env.ts");
  });
});
