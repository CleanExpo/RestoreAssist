/**
 * #45 (client-portal security MEDIUM) — `originalsOnly` upload path.
 *
 * Unreviewed client-portal evidence must NOT have compressed/thumbnail copies
 * written to the PUBLIC optimised bucket (path-guessable before staff review).
 * With `originalsOnly: true`, upload() writes the private original ONLY and
 * returns empty optimised URLs/paths — nothing reaches the public CDN.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, uploadMock, getPublicUrlMock, createSignedUrlMock } =
  vi.hoisted(() => {
    const uploadMock = vi.fn(async () => ({ error: null }));
    const getPublicUrlMock = vi.fn(() => ({
      data: { publicUrl: "https://public.cdn/x" },
    }));
    const createSignedUrlMock = vi.fn(async () => ({
      data: { signedUrl: "https://signed/x" },
      error: null,
    }));
    const fromMock = vi.fn(() => ({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
      createSignedUrl: createSignedUrlMock,
    }));
    return { fromMock, uploadMock, getPublicUrlMock, createSignedUrlMock };
  });

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({ storage: { from: fromMock } }),
}));

vi.mock("@/lib/storage/compression", () => ({
  compressImage: vi.fn(async () => ({
    compressed: Buffer.from([1, 2, 3]),
    thumbnail: Buffer.from([4, 5]),
  })),
  computeSha256: () => "a".repeat(64),
  isImageMimeType: (m: string) => m.startsWith("image/"),
  getOptimisedExtension: () => "jpg",
}));

import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import { BUCKET_ORIGINALS, BUCKET_OPTIMISED } from "@/lib/storage/types";

const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

beforeEach(() => {
  vi.clearAllMocks();
  uploadMock.mockResolvedValue({ error: null });
  createSignedUrlMock.mockResolvedValue({
    data: { signedUrl: "https://signed/x" },
    error: null,
  });
});

describe("SupabaseStorageProvider.upload — originalsOnly", () => {
  const input = {
    buffer: pngBuffer,
    filename: "client-evidence-1.png",
    mimeType: "image/png",
    folder: "evidence",
    orgId: "org_1",
    inspectionId: "insp_1",
    originalsOnly: true,
  };

  it("never writes to the public optimised bucket", async () => {
    await new SupabaseStorageProvider().upload(input);
    expect(fromMock).toHaveBeenCalledWith(BUCKET_ORIGINALS);
    expect(fromMock).not.toHaveBeenCalledWith(BUCKET_OPTIMISED);
  });

  it("writes exactly one object (the private original)", async () => {
    await new SupabaseStorageProvider().upload(input);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("never mints a public URL", async () => {
    await new SupabaseStorageProvider().upload(input);
    expect(getPublicUrlMock).not.toHaveBeenCalled();
  });

  it("returns empty optimised URLs/paths but a real signed original + storagePath", async () => {
    const out = await new SupabaseStorageProvider().upload(input);
    expect(out.compressedUrl).toBe("");
    expect(out.thumbnailUrl).toBe("");
    expect(out.compressedPath).toBe("");
    expect(out.thumbnailPath).toBe("");
    expect(out.originalUrl).toBe("https://signed/x");
    expect(out.storagePath).toMatch(/^org_1\/insp_1\/.*-original\.png$/);
    expect(out.sizeBytes).toBe(pngBuffer.byteLength);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("still writes BOTH buckets when originalsOnly is not set (default path unchanged)", async () => {
    await new SupabaseStorageProvider().upload({
      ...input,
      originalsOnly: false,
    });
    expect(fromMock).toHaveBeenCalledWith(BUCKET_OPTIMISED);
    expect(uploadMock).toHaveBeenCalledTimes(3); // original + compressed + thumbnail
  });
});
