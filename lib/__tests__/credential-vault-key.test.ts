import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt } from "../credential-vault";

// getDefaultKey() reads these at call time — save/restore around each test.
const ENV_KEYS = [
  "CREDENTIAL_ENCRYPTION_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
  "VERCEL_ENV",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("credential-vault key resolution hardening (B5)", () => {
  it("rejects an all-zero (placeholder) key", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "0".repeat(64);
    expect(() => encrypt("secret")).toThrow(/all-zero|placeholder/i);
  });

  it("accepts a valid random 32-byte hex key", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "11".repeat(32); // 64 hex chars, non-zero
    expect(() => encrypt("secret")).not.toThrow();
  });

  it("refuses the NEXTAUTH_SECRET-only fallback in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXTAUTH_SECRET = "a".repeat(40);
    expect(() => encrypt("secret")).toThrow(/production/i);
  });

  it("allows the NEXTAUTH_SECRET fallback outside production", () => {
    process.env.NEXTAUTH_SECRET = "a-dev-secret-string-value";
    expect(() => encrypt("secret")).not.toThrow();
  });

  it("uses the dedicated key in production without throwing", () => {
    process.env.VERCEL_ENV = "production";
    process.env.INTEGRATION_ENCRYPTION_KEY = "ab".repeat(32);
    expect(() => encrypt("secret")).not.toThrow();
  });
});
