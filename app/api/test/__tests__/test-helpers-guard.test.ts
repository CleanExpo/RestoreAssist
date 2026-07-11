import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testHelpersBlocked } from "../_helpers";

/**
 * The two-key guard behind the E2E test-helper routes (sign-in-as,
 * sign-in-google-as, seed-org-with-manager). Enabling session forging on a
 * VERCEL_ENV=production deploy must require BOTH flags — a single misconfig on
 * the real production app can never open it.
 */
describe("testHelpersBlocked — two-key test-helper guard", () => {
  const keys = [
    "ALLOW_TEST_HELPERS",
    "VERCEL_ENV",
    "ALLOW_TEST_HELPERS_IN_PROD_ENV",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("blocks when the opt-in is missing (default)", () => {
    expect(testHelpersBlocked()).toBe(true);
  });

  it("allows on a non-production deploy when ALLOW_TEST_HELPERS=true (local/preview)", () => {
    process.env.ALLOW_TEST_HELPERS = "true";
    // VERCEL_ENV unset (local) — allowed
    expect(testHelpersBlocked()).toBe(false);
    process.env.VERCEL_ENV = "preview";
    expect(testHelpersBlocked()).toBe(false);
  });

  it("BLOCKS the real production app: opt-in true but VERCEL_ENV=production and no prod-env opt-in", () => {
    process.env.ALLOW_TEST_HELPERS = "true";
    process.env.VERCEL_ENV = "production";
    expect(testHelpersBlocked()).toBe(true);
  });

  it("allows the sandbox project's production-target deploy: BOTH keys set", () => {
    process.env.ALLOW_TEST_HELPERS = "true";
    process.env.VERCEL_ENV = "production";
    process.env.ALLOW_TEST_HELPERS_IN_PROD_ENV = "true";
    expect(testHelpersBlocked()).toBe(false);
  });

  it("a single key is never enough on production (defense-in-depth)", () => {
    // Only the prod-env opt-in, without ALLOW_TEST_HELPERS → still blocked.
    process.env.VERCEL_ENV = "production";
    process.env.ALLOW_TEST_HELPERS_IN_PROD_ENV = "true";
    expect(testHelpersBlocked()).toBe(true);
    // Only ALLOW_TEST_HELPERS, without the prod-env opt-in → still blocked.
    delete process.env.ALLOW_TEST_HELPERS_IN_PROD_ENV;
    process.env.ALLOW_TEST_HELPERS = "true";
    expect(testHelpersBlocked()).toBe(true);
  });
});
