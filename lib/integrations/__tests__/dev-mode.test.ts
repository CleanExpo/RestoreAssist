/**
 * RA-6940 — INTEGRATION_DEV_MODE production boot guard.
 *
 * Mock OAuth flows must never be honoured in production. The module now
 * throws at init when INTEGRATION_DEV_MODE=true and VERCEL_ENV=production
 * (mirrors the lib/credential-vault.ts prod guard).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lib/integrations/dev-mode production guard", () => {
  it("throws at module init when dev mode is enabled in production", async () => {
    vi.stubEnv("INTEGRATION_DEV_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    await expect(import("../dev-mode")).rejects.toThrow(
      /INTEGRATION_DEV_MODE must not be enabled in production/,
    );
  });

  it("loads and reports dev mode enabled outside production", async () => {
    vi.stubEnv("INTEGRATION_DEV_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const mod = await import("../dev-mode");
    expect(mod.isIntegrationDevMode()).toBe(true);
  });

  it("loads in production when dev mode is off", async () => {
    vi.stubEnv("INTEGRATION_DEV_MODE", "false");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const mod = await import("../dev-mode");
    expect(mod.isIntegrationDevMode()).toBe(false);
  });
});
