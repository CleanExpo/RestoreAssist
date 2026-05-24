import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const assertInspectionTenancy = vi.fn();
const userFindUnique = vi.fn();
const evidenceCreate = vi.fn();
const storageUpload = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    evidenceItem: { create: (...a: unknown[]) => evidenceCreate(...a) },
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: (...a: unknown[]) => storageUpload(...a),
  }),
}));

const JPEG_MAGIC = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);

function imageBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set(JPEG_MAGIC, 0);
  return bytes;
}

function makeRequest(): NextRequest {
  const form = new FormData();
  form.append(
    "files",
    new File([imageBytes()], "first.jpg", { type: "image/jpeg" }),
  );
  form.append(
    "files",
    new File([imageBytes()], "second.jpg", { type: "image/jpeg" }),
  );
  form.append("evidenceClass", "PHOTO_DAMAGE");
  form.append("evidenceClass", "THERMAL_IMAGE");

  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/evidence/batch",
    {
      method: "POST",
      body: form,
    },
  );
}

function ctx() {
  return { params: Promise.resolve({ id: "inspection_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset().mockResolvedValue({
    user: { id: "user_1", name: "Tester" },
  });
  assertInspectionTenancy.mockReset().mockResolvedValue({ ok: true });
  userFindUnique.mockReset().mockResolvedValue({ organizationId: "org_1" });
  storageUpload.mockReset();
  evidenceCreate.mockReset().mockImplementation(async (args) => ({
    id: "evidence_1",
    ...args.data,
  }));
});

describe("POST /api/inspections/[id]/evidence/batch", () => {
  it("keeps source file metadata paired with successful uploads after a partial storage failure", async () => {
    storageUpload
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({
        originalUrl: "https://storage/original-second.jpg",
        compressedUrl: "https://storage/second.jpg",
        thumbnailUrl: "https://storage/second-thumb.jpg",
        storagePath: "org_1/inspection_1/second-original.jpg",
        compressedPath: "org_1/inspection_1/second-compressed.jpg",
        thumbnailPath: "org_1/inspection_1/second-thumb.jpg",
        sizeBytes: 64,
        sha256: "abc123",
      });

    const res = await POST(makeRequest(), ctx());
    const body = await res.json();

    expect(res.status).toBe(207);
    expect(body.data.failed).toEqual([
      { filename: "first.jpg", error: "Upload failed" },
    ]);
    expect(evidenceCreate).toHaveBeenCalledTimes(1);
    expect(evidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "second.jpg",
          evidenceClass: "THERMAL_IMAGE",
          fileUrl: "https://storage/second.jpg",
          fileMimeType: "image/jpeg",
          hashSha256: "abc123",
        }),
      }),
    );
  });
});
