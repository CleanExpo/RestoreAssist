/**
 * SP-E Block 2 — GoogleDriveStorageProvider unit tests.
 *
 * Mocks googleapis (via the shared uploadToDrive helper) + prisma +
 * credential-vault to keep the test hermetic. The contract under test is:
 *
 *  - `upload()` reads the org's encrypted refresh token, decrypts it, and
 *    calls `uploadToDrive` with the org-scoped tokens.
 *  - The returned UploadOutput exposes the Drive webViewLink as
 *    `originalUrl` and leaves `compressedUrl` / `thumbnailUrl` empty
 *    (Drive doesn't run the Supabase compression pipeline).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
  encrypt: vi.fn((v: string) => `enc:${v}`),
}));

vi.mock("@/lib/cloud-mirror/drive", () => ({
  uploadToDrive: vi.fn(async () => ({
    providerFileId: "drive-file-id",
    viewUrl: "https://drive.google.com/file/d/drive-file-id/view",
  })),
}));

import { prisma } from "@/lib/prisma";
import { uploadToDrive } from "@/lib/cloud-mirror/drive";
import { GoogleDriveStorageProvider } from "../google-drive-provider";

describe("GoogleDriveStorageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upload() decrypts the org refresh token and delegates to uploadToDrive", async () => {
    (
      prisma.organization.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "org_1",
      storageProvider: "GOOGLE_DRIVE",
      storageProviderRefreshToken: "enc:refresh-token-xyz",
      storageProviderAccessToken: "enc:access-token-xyz",
      storageProviderTokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    const provider = new GoogleDriveStorageProvider("org_1");
    const result = await provider.upload({
      buffer: Buffer.from("hello"),
      filename: "shot.jpg",
      mimeType: "image/jpeg",
      folder: "inspections/abc",
      orgId: "org_1",
      inspectionId: "abc",
    });

    expect(uploadToDrive).toHaveBeenCalledTimes(1);
    const call = (uploadToDrive as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.accessToken).toBe("access-token-xyz");
    expect(call.refreshToken).toBe("refresh-token-xyz");
    expect(call.filename).toBe("shot.jpg");
    expect(call.mimeType).toBe("image/jpeg");

    expect(result.originalUrl).toBe(
      "https://drive.google.com/file/d/drive-file-id/view",
    );
    expect(result.compressedUrl).toBe("");
    expect(result.thumbnailUrl).toBe("");
    expect(result.sizeBytes).toBe(5);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("upload() throws when the org has no Drive connection", async () => {
    (
      prisma.organization.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "org_1",
      storageProvider: "GOOGLE_DRIVE",
      storageProviderRefreshToken: null,
      storageProviderAccessToken: null,
      storageProviderTokenExpiresAt: null,
    });

    const provider = new GoogleDriveStorageProvider("org_1");
    await expect(
      provider.upload({
        buffer: Buffer.from("x"),
        filename: "f.jpg",
        mimeType: "image/jpeg",
        folder: "x",
        orgId: "org_1",
      }),
    ).rejects.toThrow(/Google Drive is not connected/);
  });
});
