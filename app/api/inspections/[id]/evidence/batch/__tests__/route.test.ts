import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const assertInspectionTenancy = vi.fn();
const userFindUnique = vi.fn();
const evidenceCreate = vi.fn();
const storageUpload = vi.fn();
const signingKeyFindFirst = vi.fn();

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
    // RA-7090 round 2 (MUST-FIX 2): this writer is now under the shared
    // signing policy, which probes for a live registered key.
    deviceSigningKey: {
      findFirst: (...a: unknown[]) => signingKeyFindFirst(...a),
    },
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
  signingKeyFindFirst.mockReset().mockResolvedValue(null);
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
  evidenceCreate.mockReset().mockImplementation(async (args) => ({
    id: "evidence_1",
    ...args.data,
  }));
});

describe("POST /api/inspections/[id]/evidence/batch", () => {
  // RA-7090 slice 2 review (MUST-FIX 1): this is the THIRD evidence writer.
  // It must go through the same shared structuredData sanitiser, so a batch
  // record can never present as signed.
  it("stamps signedManifestVerified:false and keeps server-owned storage paths", async () => {
    storageUpload.mockResolvedValue({
      originalUrl: "https://storage/original.jpg",
      compressedUrl: "https://storage/c.jpg",
      thumbnailUrl: "https://storage/t.jpg",
      storagePath: "org_1/inspection_1/original.jpg",
      compressedPath: "org_1/inspection_1/c.jpg",
      thumbnailPath: "org_1/inspection_1/t.jpg",
      sizeBytes: 64,
      sha256: "abc123",
    });

    const res = await POST(makeRequest(), ctx());
    expect(res.status).toBe(207);

    const structured = JSON.parse(evidenceCreate.mock.calls[0][0].data.structuredData);
    expect(structured.signedManifestVerified).toBe(false);
    expect(structured.c2paManifest).toBeUndefined();
    expect(structured.originalStoragePath).toBe(
      "org_1/inspection_1/original.jpg",
    );
    expect(structured.compressedStoragePath).toBe("org_1/inspection_1/c.jpg");
    expect(structured.thumbnailStoragePath).toBe("org_1/inspection_1/t.jpg");
  });

  // RA-7090 round 2 (MUST-FIX 2): review proved this writer contained NO
  // reference to the policy flag at all, so 20 files here produced 20
  // unsigned policy-exempt rows while the policy was ON.
  describe("is under the SAME signing policy as the other writers", () => {
    function uploadOk() {
      storageUpload.mockResolvedValue({
        originalUrl: "https://storage/original.jpg",
        compressedUrl: "https://storage/c.jpg",
        thumbnailUrl: "https://storage/t.jpg",
        storagePath: "org_1/inspection_1/original.jpg",
        compressedPath: "org_1/inspection_1/c.jpg",
        thumbnailPath: "org_1/inspection_1/t.jpg",
        sizeBytes: 64,
        sha256: "abc123",
      });
    }

    it("REFUSES the whole batch when the policy is ON and the user holds a live key", async () => {
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
      signingKeyFindFirst.mockResolvedValue({ id: "dk1" });
      uploadOk();

      const res = await POST(makeRequest(), ctx());
      expect(res.status).toBe(400);
      // Refused BEFORE any byte is stored or any row written.
      expect(storageUpload).not.toHaveBeenCalled();
      expect(evidenceCreate).not.toHaveBeenCalled();
    });

    it("records the downgrade reason on EVERY row when the policy is OFF", async () => {
      signingKeyFindFirst.mockResolvedValue({ id: "dk1" });
      uploadOk();

      const res = await POST(makeRequest(), ctx());
      expect(res.status).toBe(207);
      expect(evidenceCreate).toHaveBeenCalledTimes(2);
      for (const call of evidenceCreate.mock.calls) {
        const structured = JSON.parse(call[0].data.structuredData);
        expect(structured.signedManifestVerified).toBe(false);
        expect(structured.signedManifestDowngradeReason).toBe(
          "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
        );
      }
    });

    it("records NO downgrade reason when the user has no registered key", async () => {
      uploadOk();
      await POST(makeRequest(), ctx());
      const structured = JSON.parse(
        evidenceCreate.mock.calls[0][0].data.structuredData,
      );
      expect(structured.signedManifestDowngradeReason).toBeUndefined();
    });

    it("evaluates the policy ONCE for the whole batch, not per file", async () => {
      uploadOk();
      await POST(makeRequest(), ctx());
      expect(signingKeyFindFirst).toHaveBeenCalledTimes(1);
    });
  });

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
