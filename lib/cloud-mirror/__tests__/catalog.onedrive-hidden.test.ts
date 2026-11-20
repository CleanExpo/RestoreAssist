/**
 * RA-8078 — OneDrive mirroring is not built end to end (the choice cannot be
 * saved, nothing reads it, and the Microsoft token is never refreshed), so the
 * catalog must not offer it, even when the Microsoft OAuth env is configured.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("PROVIDER_CATALOG — OneDrive", () => {
  const original = process.env.MICROSOFT_CLIENT_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = original;
    vi.resetModules();
  });

  it("is disabled and labelled coming soon even when MICROSOFT_CLIENT_ID is set", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-client-id";
    vi.resetModules();
    const { PROVIDER_CATALOG } = await import("../index");
    const onedrive = PROVIDER_CATALOG.find((p) => p.id === "onedrive");
    expect(onedrive?.enabled).toBe(false);
    expect(onedrive?.tagline).toMatch(/coming soon/i);
  });

  it("keeps Google Drive enabled", async () => {
    const { PROVIDER_CATALOG } = await import("../index");
    expect(PROVIDER_CATALOG.find((p) => p.id === "drive")?.enabled).toBe(true);
  });
});
