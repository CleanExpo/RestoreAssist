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
  "BILLING_MODE",
  "VERCEL",
  "VERCEL_PROJECT_ID",
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

describe("explicit sandbox billing", () => {
  beforeEach(() => {
    process.env.BILLING_MODE = "sandbox";
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_ID = "prj_i9clta3fzdpQwNhVmf9BMMddpG3k";
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";
  });

  it("accepts test keys in the sandbox Vercel Production project without rewriting its environment", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(trigger()).resolves.toBeDefined();
    expect(process.env.VERCEL_ENV).toBe("production");
    expect(process.env.NODE_ENV).toBe("production");
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts the existing server-side publishable key fallback", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";
    await expect(trigger()).resolves.toBeDefined();
  });

  it("also enforces sandbox keys on Vercel preview", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    await expect(trigger()).rejects.toThrow(/must be a test key/);
  });

  it.each([undefined, "prj_other", "prj_i9clta3fzdpQwNhVmf9BMMddpG3k "])(
    "rejects project identity %s even with otherwise valid live keys",
    async (projectId) => {
      if (projectId === undefined) delete process.env.VERCEL_PROJECT_ID;
      else process.env.VERCEL_PROJECT_ID = projectId;
      process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_abc123";
      await expect(trigger()).rejects.toThrow(/sandbox.*only.*Vercel project/);
    },
  );

  it.each([undefined, "0", "true"])(
    "rejects a non-Vercel runtime (%s) even with the sandbox project ID",
    async (vercel) => {
      if (vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = vercel;
      await expect(trigger()).rejects.toThrow(/sandbox.*only.*Vercel project/);
    },
  );

  it.each(["sk_test_abc123", "sk_live_abc123"])(
    "rejects an accidental sandbox flag on DigitalOcean with %s",
    async (key) => {
      delete process.env.VERCEL;
      delete process.env.VERCEL_PROJECT_ID;
      delete process.env.VERCEL_ENV;
      process.env.STRIPE_SECRET_KEY = key;
      await expect(trigger()).rejects.toThrow(/sandbox.*only.*Vercel project/);
    },
  );

  it.each(["sk_live_abc123", "sk_testabc123", "pk_test_abc123", ""])(
    "rejects a live, malformed, wrong-type or empty secret (%s)",
    async (key) => {
      process.env.STRIPE_SECRET_KEY = key;
      await expect(trigger()).rejects.toThrow(
        key ? "STRIPE_SECRET_KEY must be a test key (sk_test_…) in sandbox billing mode" : "STRIPE_SECRET_KEY is not set",
      );
    },
  );

  it("rejects a missing secret", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(trigger()).rejects.toThrow("STRIPE_SECRET_KEY is not set");
  });

  it.each(["pk_live_abc123", "pk_testabc123", "sk_test_abc123", ""])(
    "rejects a live, malformed, wrong-type or empty publishable key (%s)",
    async (key) => {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = key;
      await expect(trigger()).rejects.toThrow(
        /publishable key must be a test key/,
      );
    },
  );

  it("rejects a missing publishable key", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    await expect(trigger()).rejects.toThrow(
      /publishable key must be a test key/,
    );
  });

  it("rejects a live fallback even when the preferred publishable key is test mode", async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_abc123";
    await expect(trigger()).rejects.toThrow(
      /publishable key must be a test key/,
    );
  });

  it.each([undefined, "", "Sandbox", "sandbox ", "live"])(
    "preserves the exact live-production rejection without explicit opt-in (%s)",
    async (mode) => {
      if (mode === undefined) delete process.env.BILLING_MODE;
      else process.env.BILLING_MODE = mode;
      await expect(trigger()).rejects.toThrow(
        "STRIPE_SECRET_KEY must be a live key (sk_live_…) in production",
      );
    },
  );
});

describe("legacy production behaviour without BILLING_MODE", () => {
  it("still rejects test keys on DigitalOcean", async () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    await expect(trigger()).rejects.toThrow(
      "STRIPE_SECRET_KEY must be a live key (sk_live_…) in production",
    );
  });

  it("still allows a missing publishable key with a live secret", async () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    await expect(trigger()).resolves.toBeDefined();
  });

  it("preserves the exact publishable-key error", async () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";
    await expect(trigger()).rejects.toThrow(
      "Stripe publishable key must be a live key (pk_live_…) in production",
    );
  });

  it("preserves the exact warning outside production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    await expect(trigger()).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[stripe] live secret key (sk_live_…) detected outside production — refusing to charge real cards is your responsibility",
    );
  });
});
