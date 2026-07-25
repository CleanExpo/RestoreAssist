/**
 * RA-7090 slice 1: multipart evidence upload — server recomputes SHA-256
 * over the exact stored bytes, rejects tampered uploads, and always
 * persists the server-computed hash.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: { create: vi.fn() },
  },
}));

const uploadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({ upload: uploadMock })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mCreate = prisma.evidenceItem.create as unknown as ReturnType<
  typeof vi.fn
>;

// Known fixture: minimal JPEG-magic-byte payload.
const FIXTURE_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x52, 0x41, 0x2d, 0x37, 0x30, 0x39, 0x30,
]);
const FIXTURE_SHA256 = createHash("sha256")
  .update(Buffer.from(FIXTURE_BYTES))
  .digest("hex");

const UPLOAD_RESULT = {
  compressedUrl: "https://storage/evidence/x-compressed.jpg",
  thumbnailUrl: "https://storage/evidence/x-thumb.jpg",
  storagePath: "evidence/x-original.jpg",
  compressedPath: "evidence/x-compressed.jpg",
  thumbnailPath: "evidence/x-thumb.jpg",
  sha256: FIXTURE_SHA256,
  sizeBytes: FIXTURE_BYTES.length,
};

function multipartRequest(form: FormData) {
  return new NextRequest("http://localhost/api/inspections/i1/evidence", {
    method: "POST",
    body: form,
  });
}

function baseForm(bytes: Uint8Array, clientSha256?: string) {
  const form = new FormData();
  form.append(
    "file",
    new File([bytes], "capture-1.jpeg", { type: "image/jpeg" }),
  );
  form.append("evidenceClass", "PHOTO_DAMAGE");
  form.append("workflowStepId", "step1");
  form.append("deviceType", "IOS_CAPACITOR");
  form.append("capturedLat", "-33.8688");
  form.append("capturedLng", "151.2093");
  form.append(
    "structuredData",
    JSON.stringify({
      c2paManifest: {
        capturedAt: "2026-07-25T00:00:00.000Z",
        sha256: clientSha256 ?? FIXTURE_SHA256,
        lat: -33.8688,
        lng: 151.2093,
      },
    }),
  );
  if (clientSha256 !== undefined) form.append("sha256", clientSha256);
  return form;
}

const params = { params: Promise.resolve({ id: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech One" } });
  uploadMock.mockResolvedValue(UPLOAD_RESULT);
  mCreate.mockImplementation(async ({ data }: any) => ({ id: "e1", ...data }));
});

describe("POST /evidence (multipart, RA-7090)", () => {
  it("accepts a valid upload when the client hash matches the stored bytes", async () => {
    const res = await POST(
      multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
      params,
    );
    expect(res.status).toBe(201);

    // Uploaded buffer is byte-identical to what was hashed.
    const uploadedBuffer = uploadMock.mock.calls[0][0].buffer as Buffer;
    expect(uploadedBuffer.equals(Buffer.from(FIXTURE_BYTES))).toBe(true);

    // Persisted hash is the server-computed hash over those exact bytes.
    const created = mCreate.mock.calls[0][0].data;
    expect(created.hashSha256).toBe(FIXTURE_SHA256);
    expect(created.fileUrl).toBe(UPLOAD_RESULT.compressedUrl);
    const structured = JSON.parse(created.structuredData);
    expect(structured.c2paManifest.sha256).toBe(FIXTURE_SHA256);
    expect(structured.originalStoragePath).toBe(UPLOAD_RESULT.storagePath);
  });

  it("rejects a tampered upload with 400 and a clear error", async () => {
    // Client hash was computed over the ORIGINAL bytes, but the bytes in
    // transit were altered.
    const tampered = Uint8Array.from(FIXTURE_BYTES);
    tampered[tampered.length - 1] ^= 0xff;

    const res = await POST(
      multipartRequest(baseForm(tampered, FIXTURE_SHA256)),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("Hash mismatch");

    // Nothing is stored on a rejected upload.
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("stores the server-computed hash even when no client hash is supplied", async () => {
    const res = await POST(multipartRequest(baseForm(FIXTURE_BYTES)), params);
    expect(res.status).toBe(201);
    expect(mCreate.mock.calls[0][0].data.hashSha256).toBe(FIXTURE_SHA256);
  });

  it("rejects files that are not images by magic bytes", async () => {
    const notAnImage = new TextEncoder().encode("plain text pretending");
    const res = await POST(
      multipartRequest(baseForm(notAnImage)),
      params,
    );
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("JSON path still works and cannot set hashSha256 from the client", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/inspections/i1/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evidenceClass: "TECHNICIAN_NOTE",
          notes: "text-only evidence",
          hashSha256: "attacker-controlled-value",
        }),
      }),
      params,
    );
    expect(res.status).toBe(201);
    const created = mCreate.mock.calls[0][0].data;
    expect(created.hashSha256).toBeUndefined();
  });
});
