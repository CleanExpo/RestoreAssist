import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Stripe client is a lazy singleton (lib/stripe.ts). Accessing any property
// on the exported `stripe` proxy triggers getInstance(), where the test/live
// mode guard runs. We reset modules + env between cases so each import builds a
// fresh singleton under the env we set.

const KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "VERCEL_ENV",
  "NODE_ENV",
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

async function trigger() {
  const { stripe } = await import("@/lib/stripe");
  // property access drives the proxy → getInstance() → guard
  return (stripe as unknown as Record<string, unknown>).customers;
}

describe("stripe test/live mode guard", () => {
  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    await expect(trigger()).rejects.toThrow(/STRIPE_SECRET_KEY is not set/);
  });

  it("rejects a test secret key in production (VERCEL_ENV=production)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    await expect(trigger()).rejects.toThrow(/must be a live key/);
  });

  it("accepts a live secret key in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_abc123";
    await expect(trigger()).resolves.toBeDefined();
  });

  it("rejects a live secret with a non-live publishable key in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";
    await expect(trigger()).rejects.toThrow(/publishable key must be a live key/);
  });

  it("allows a test secret key on a Vercel preview deploy", async () => {
    // preview runs with NODE_ENV=production but VERCEL_ENV=preview
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    await expect(trigger()).resolves.toBeDefined();
  });

  it("warns (does not throw) on a live key outside production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.VERCEL_ENV = "development";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    await expect(trigger()).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("live secret key"),
    );
  });
});
