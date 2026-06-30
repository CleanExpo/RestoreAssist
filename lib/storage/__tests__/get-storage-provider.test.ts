/**
 * STORM #17 — the storage factory must FAIL FAST for an unimplemented BYOS
 * provider (S3/GCS/AZURE) rather than returning a stub that rejects on every
 * call (a deferred, silent per-operation failure).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { organizationMock } = vi.hoisted(() => ({
  organizationMock: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { organization: organizationMock },
}));

import { getStorageProvider } from "../index";
import { SupabaseStorageProvider } from "../supabase-provider";

beforeEach(() => {
  organizationMock.findUnique.mockReset();
});

describe("getStorageProvider", () => {
  it("returns the Supabase provider when orgId is missing (no DB hit)", async () => {
    const p = await getStorageProvider(null);
    expect(p).toBeInstanceOf(SupabaseStorageProvider);
    expect(organizationMock.findUnique).not.toHaveBeenCalled();
  });

  it("returns the Supabase provider for a SUPABASE-configured org", async () => {
    organizationMock.findUnique.mockResolvedValue({
      storageProvider: "SUPABASE",
      storageBucketUrl: null,
    });
    expect(await getStorageProvider("org_1")).toBeInstanceOf(
      SupabaseStorageProvider,
    );
  });

  it("falls back to Supabase when the org is not found", async () => {
    organizationMock.findUnique.mockResolvedValue(null);
    expect(await getStorageProvider("org_missing")).toBeInstanceOf(
      SupabaseStorageProvider,
    );
  });

  it.each(["S3", "GCS", "AZURE"])(
    "fails fast (throws) for unimplemented BYOS provider %s",
    async (provider) => {
      organizationMock.findUnique.mockResolvedValue({
        storageProvider: provider,
        storageBucketUrl: "bucket://x",
      });
      await expect(getStorageProvider("org_1")).rejects.toThrow(
        /not implemented yet/i,
      );
    },
  );
});
