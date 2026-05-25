import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { POST } from "../route";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const userFindUnique = vi.fn();
const photoCreate = vi.fn();
const auditLogCreate = vi.fn();
const storageUpload = vi.fn();
const rateLimit = vi.fn();
const idempotencyRecords = new Map<string, any>();
const idempotencyRecordCreate = vi.fn(async ({ data }: { data: any }) => {
  if (idempotencyRecords.has(data.cacheKey)) throw { code: "P2002" };
  const record = {
    ...data,
    responseStatus: data.responseStatus ?? null,
    responseBody: data.responseBody ?? null,
    responseContentType: data.responseContentType ?? null,
  };
  idempotencyRecords.set(data.cacheKey, record);
  return record;
});
const idempotencyRecordFindUnique = vi.fn(
  async ({ where }: { where: { cacheKey: string } }) =>
    idempotencyRecords.get(where.cacheKey) ?? null,
);
const idempotencyRecordUpdate = vi.fn(
  async ({ where, data }: { where: { cacheKey: string }; data: any }) => {
    const existing = idempotencyRecords.get(where.cacheKey);
    if (!existing) throw new Error("Record not found");
    const updated = { ...existing, ...data };
    idempotencyRecords.set(where.cacheKey, updated);
    return updated;
  },
);
const idempotencyRecordDeleteMany = vi.fn(async (args?: any) => {
  if (!args?.where) {
    const count = idempotencyRecords.size;
    idempotencyRecords.clear();
    return { count };
  }

  if (args.where.cacheKey) {
    const deleted = idempotencyRecords.delete(args.where.cacheKey);
    return { count: deleted ? 1 : 0 };
  }

  if (args.where.expiresAt?.lt) {
    let count = 0;
    for (const [cacheKey, record] of idempotencyRecords) {
      if (record.expiresAt < args.where.expiresAt.lt) {
        idempotencyRecords.delete(cacheKey);
        count++;
      }
    }
    return { count };
  }

  return { count: 0 };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    inspectionPhoto: { create: (...a: unknown[]) => photoCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    idempotencyRecord: {
      create: (...a: unknown[]) => idempotencyRecordCreate(...a),
      findUnique: (...a: unknown[]) => idempotencyRecordFindUnique(...a),
      update: (...a: unknown[]) => idempotencyRecordUpdate(...a),
      deleteMany: (...a: unknown[]) => idempotencyRecordDeleteMany(...a),
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: (...a: unknown[]) => storageUpload(...a),
  }),
}));
vi.mock("@/lib/media/exif-extract", () => ({
  extractAndSaveMediaAsset: vi.fn(),
}));
vi.mock("@/lib/media/catalog", () => ({ scheduleCatalog: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => rateLimit(...a),
}));

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const JPEG_MAGIC = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);
const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const BAD_MAGIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function makeRequest(
  file: Uint8Array,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  const form = new FormData();
  form.append("file", new Blob([file], { type: "image/jpeg" }), "test.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest("http://localhost/api/inspections/i_1/photos", {
    method: "POST",
    body: form,
    headers: { "user-agent": "vitest-runner/1.0", ...headers },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "i_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  userFindUnique.mockReset();
  photoCreate.mockReset();
  auditLogCreate.mockReset();
  storageUpload.mockReset();
  rateLimit.mockReset().mockResolvedValue(null);
  idempotencyRecords.clear();
  idempotencyRecordCreate.mockClear();
  idempotencyRecordFindUnique.mockClear();
  idempotencyRecordUpdate.mockClear();
  idempotencyRecordDeleteMany.mockClear();
  getServerSession.mockResolvedValue({
    user: { id: "u_1", image: "https://example.com/me.jpg" },
  });
  inspectionFindFirst.mockResolvedValue({ id: "i_1", workspaceId: "ws_1" });
  userFindUnique.mockResolvedValue({ organizationId: "org_1" });
  storageUpload.mockResolvedValue({
    compressedUrl: "https://stor/test.jpg",
    thumbnailUrl: "https://stor/test_thumb.jpg",
    storagePath: "inspections/i_1/test.jpg",
    sha256: "deadbeef",
  });
  auditLogCreate.mockResolvedValue({ id: "a_1" });
  photoCreate.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: "p_1",
      ...args.data,
    }),
  );
});

describe("POST /api/inspections/[id]/photos (cocoa extension)", () => {
  it("rejects non-JPEG/PNG bytes with 400 (rule 11)", async () => {
    const file = new Uint8Array(100);
    file.set(BAD_MAGIC, 0);
    const sha = sha256Hex(file);
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: sha,
        capturedAtUtc: new Date().toISOString(),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects hash mismatch with 400", async () => {
    const file = new Uint8Array(100);
    file.set(JPEG_MAGIC, 0);
    const wrongSha = "0".repeat(64);
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: wrongSha,
        capturedAtUtc: new Date().toISOString(),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("persists cocoa fields on JPEG happy path (returns 201)", async () => {
    const file = new Uint8Array(100);
    file.set(JPEG_MAGIC, 0);
    const sha = sha256Hex(file);
    const capturedAt = new Date().toISOString();
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: sha,
        capturedAtUtc: capturedAt,
        caption: "test caption",
        gpsLat: "1.0",
        gpsLng: "2.0",
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(photoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cocoaSha256: sha,
          cocoaCapturedAtUtc: expect.any(Date),
          cocoaUserHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          cocoaDeviceHint: expect.any(String),
        }),
      }),
    );
  });

  it("accepts PNG magic bytes (returns 201)", async () => {
    const file = new Uint8Array(100);
    file.set(PNG_MAGIC, 0);
    const sha = sha256Hex(file);
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: sha,
        capturedAtUtc: new Date().toISOString(),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });

  it("replays duplicate multipart upload by Idempotency-Key without uploading twice", async () => {
    const file = new Uint8Array(100);
    file.set(JPEG_MAGIC, 0);
    const sha = sha256Hex(file);
    const headers = { "idempotency-key": "photo-upload-key-1" };

    const first = await POST(
      makeRequest(
        file,
        { cocoaSha256: sha, caption: "same photo" },
        headers,
      ),
      ctx(),
    );
    const second = await POST(
      makeRequest(
        file,
        { cocoaSha256: sha, caption: "same photo" },
        headers,
      ),
      ctx(),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(photoCreate).toHaveBeenCalledTimes(1);
  });
});
