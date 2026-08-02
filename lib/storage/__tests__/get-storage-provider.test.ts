/**
 * Storage factory — Cloudinary is the default primary; unimplemented BYOS
 * providers (S3/GCS/AZURE) must FAIL FAST.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { organizationMock } = vi.hoisted(() => ({
  organizationMock: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { organization: organizationMock },
}));

import { getStorageProvider } from "../index";
import { CloudinaryStorageProvider } from "../cloudinary-provider";

beforeEach(() => {
  organizationMock.findUnique.mockReset();
});

describe("getStorageProvider", () => {
  it("returns the Cloudinary provider when orgId is missing (no DB hit)", async () => {
    const p = await getStorageProvider(null);
    expect(p).toBeInstanceOf(CloudinaryStorageProvider);
    expect(organizationMock.findUnique).not.toHaveBeenCalled();
  });

  it("returns the Cloudinary provider for a SUPABASE-configured org", async () => {
    organizationMock.findUnique.mockResolvedValue({
      storageProvider: "SUPABASE",
      storageBucketUrl: null,
    });
    expect(await getStorageProvider("org_1")).toBeInstanceOf(
      CloudinaryStorageProvider,
    );
  });

  it("falls back to Cloudinary when the org is not found", async () => {
    organizationMock.findUnique.mockResolvedValue(null);
    expect(await getStorageProvider("org_missing")).toBeInstanceOf(
      CloudinaryStorageProvider,
    );
  });

  it("returns Cloudinary as primary for GOOGLE_DRIVE orgs (mirror is separate)", async () => {
    organizationMock.findUnique.mockResolvedValue({
      storageProvider: "GOOGLE_DRIVE",
      storageBucketUrl: null,
    });
    expect(await getStorageProvider("org_1")).toBeInstanceOf(
      CloudinaryStorageProvider,
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
