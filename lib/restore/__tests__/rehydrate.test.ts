import { describe, it, expect, vi, beforeEach } from "vitest";
import { RestoreMode } from "@prisma/client";
import crypto from "crypto";

const { existsMock, restoreToPathMock, downloadByFileId, FakeDriveProvider } =
  vi.hoisted(() => {
    const existsMock = vi.fn();
    const restoreToPathMock = vi.fn();
    const downloadByFileId = vi.fn();
    class FakeDriveProvider {
      downloadByFileId = downloadByFileId;
    }
    return { existsMock, restoreToPathMock, downloadByFileId, FakeDriveProvider };
  });

vi.mock("@/lib/storage/supabase-provider", () => ({
  SupabaseStorageProvider: class {
    exists = existsMock;
    restoreToPath = restoreToPathMock;
  },
}));

vi.mock("@/lib/storage/google-drive-provider", () => ({
  GoogleDriveStorageProvider: FakeDriveProvider,
}));

vi.mock("@/lib/storage", () => ({
  getMirrorStorageProvider: vi.fn(async () => new FakeDriveProvider()),
}));

// Pass-through rate-limit + circuit-breaker so the engine logic is what's tested.
vi.mock("@/lib/integrations/rate-limiter", () => ({
  withRateLimit: (_k: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/integrations/circuit-breaker", () => ({
  withCircuitBreaker: (_k: string, fn: () => Promise<unknown>) => fn(),
  DEFAULT_CIRCUIT_OPTIONS: {},
}));

import { rehydrateOne } from "@/lib/restore/rehydrate";

function fakeJob(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rj1",
    orgId: "org1",
    sourceMirrorJobId: "mj1",
    kind: "PHOTO",
    mode: RestoreMode.MISSING,
    status: "PROCESSING",
    sourceStoragePath: "org1/insp1/photo.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    driveFileId: "drive123",
    inspectionId: "insp1",
    expectedSha256: null,
    ...over,
  } as unknown as Parameters<typeof rehydrateOne>[0];
}

describe("rehydrateOne", () => {
  beforeEach(() => {
    existsMock.mockReset();
    restoreToPathMock.mockReset();
    downloadByFileId.mockReset();
  });

  it("SKIPS when MISSING mode and the file already exists", async () => {
    existsMock.mockResolvedValue(true);
    const out = await rehydrateOne(fakeJob());
    expect(out.status).toBe("SKIPPED");
    expect(downloadByFileId).not.toHaveBeenCalled();
    expect(restoreToPathMock).not.toHaveBeenCalled();
  });

  it("restores when the file is missing", async () => {
    existsMock.mockResolvedValue(false);
    const bytes = Buffer.from("hello");
    downloadByFileId.mockResolvedValue(bytes);
    restoreToPathMock.mockResolvedValue(undefined);
    const out = await rehydrateOne(fakeJob());
    expect(out).toEqual({
      status: "COMPLETED",
      restoredBytes: 5,
      restoredSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
    expect(downloadByFileId).toHaveBeenCalledWith("drive123");
    expect(restoreToPathMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      bytes,
      "image/jpeg",
      { upsert: false },
    );
  });

  it("FORCE mode overwrites without an existence check", async () => {
    const bytes = Buffer.from("z");
    downloadByFileId.mockResolvedValue(bytes);
    restoreToPathMock.mockResolvedValue(undefined);
    await rehydrateOne(fakeJob({ mode: RestoreMode.FORCE }));
    expect(existsMock).not.toHaveBeenCalled();
    expect(restoreToPathMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      bytes,
      "image/jpeg",
      { upsert: true },
    );
  });

  it("throws an integrity error when the hash does not match", async () => {
    existsMock.mockResolvedValue(false);
    downloadByFileId.mockResolvedValue(Buffer.from("hello"));
    await expect(
      rehydrateOne(fakeJob({ expectedSha256: "deadbeef" })),
    ).rejects.toThrow(/integrity/i);
    expect(restoreToPathMock).not.toHaveBeenCalled();
  });
});
