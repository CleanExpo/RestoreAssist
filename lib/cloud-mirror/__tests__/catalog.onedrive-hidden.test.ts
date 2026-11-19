/**
 * RA-8078 / Wave 3 — OneDrive catalog follows Microsoft OAuth configuration.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("PROVIDER_CATALOG — OneDrive", () => {
  const originalId = process.env.MICROSOFT_CLIENT_ID;
  const originalSecret = process.env.MICROSOFT_CLIENT_SECRET;

  afterEach(() => {
    if (originalId === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.MICROSOFT_CLIENT_SECRET;
    else process.env.MICROSOFT_CLIENT_SECRET = originalSecret;
    vi.resetModules();
  });

  it("is disabled when Microsoft OAuth is not fully configured", async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    vi.resetModules();
    const { PROVIDER_CATALOG } = await import("../index");
    const onedrive = PROVIDER_CATALOG.find((p) => p.id === "onedrive");
    expect(onedrive?.enabled).toBe(false);
  });

  it("is enabled when MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
    vi.resetModules();
    const { PROVIDER_CATALOG, isOneDriveMirrorCatalogEnabled } = await import(
      "../index"
    );
    expect(isOneDriveMirrorCatalogEnabled()).toBe(true);
    const onedrive = PROVIDER_CATALOG.find((p) => p.id === "onedrive");
    expect(onedrive?.enabled).toBe(true);
    expect(onedrive?.tagline).toMatch(/Mirrors to your OneDrive/i);
  });

  it("keeps Google Drive enabled", async () => {
    const { PROVIDER_CATALOG } = await import("../index");
    expect(PROVIDER_CATALOG.find((p) => p.id === "drive")?.enabled).toBe(true);
  });
});