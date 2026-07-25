/**
 * RA-7090 slice 1: multipart evidence upload — server recomputes SHA-256
 * over the exact stored bytes, rejects tampered uploads, and always
 * persists the server-computed hash.
 *
 * Review hardening (Codex/Opus, 2026-07-25):
 * - the storage mock's sha256 deliberately DIFFERS from the fixture hash, so
 *   an implementation trusting the storage result or the client hash fails
 * - idempotency exercised against the REAL withIdempotencyFingerprint via an
 *   in-memory idempotencyRecord fake (replay 201 + fingerprint-conflict 409)
 * - 20 MB boundary, authz (401/404), storage compensation on create failure
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// In-memory fake of the idempotencyRecord table — faithful to the contract
// the real lib/idempotency.ts relies on: unique cacheKey (P2002 on dupe),
// findUnique, update, deleteMany.
const idemStore = new Map<string, any>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: { create: vi.fn() },
    // Slice 2 review: the unsigned path probes for a registered signing key
    // to record the downgrade reason. Mocked so that probe genuinely runs
    // here rather than silently erroring into its fallback.
    deviceSigningKey: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    idempotencyRecord: {
      create: vi.fn(async ({ data }: any) => {
        if (idemStore.has(data.cacheKey)) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        idemStore.set(data.cacheKey, {
          responseStatus: null,
          responseBody: null,
          responseContentType: null,
          ...data,
        });
        return data;
      }),
      findUnique: vi.fn(
        async ({ where }: any) => idemStore.get(where.cacheKey) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const rec = idemStore.get(where.cacheKey);
        Object.assign(rec, data);
        return rec;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        if (where?.cacheKey) {
          idemStore.delete(where.cacheKey);
        } else if (where?.expiresAt?.lt) {
          for (const [k, v] of idemStore) {
            if (v.expiresAt < where.expiresAt.lt) idemStore.delete(k);
          }
        }
        return { count: 0 };
      }),
    },
  },
}));

const uploadMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({
    upload: uploadMock,
    delete: deleteMock,
  })),
}));

import { getServerSession } from "next-auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { BUCKET_OPTIMISED, BUCKET_ORIGINALS } from "@/lib/storage/types";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
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
  // Deliberately NOT the fixture hash: an implementation that persists the
  // storage provider's claim (or the client's) instead of recomputing over
  // the received bytes must fail the assertions below.
  sha256: "deadbeef-storage-provider-claim-not-authoritative",
  sizeBytes: FIXTURE_BYTES.length,
};

function multipartRequest(form: FormData, idempotencyKey?: string) {
  return new NextRequest("http://localhost/api/inspections/i1/evidence", {
    method: "POST",
    body: form,
    ...(idempotencyKey
      ? { headers: { "Idempotency-Key": idempotencyKey } }
      : {}),
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
  idemStore.clear();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech One" } });
  uploadMock.mockResolvedValue(UPLOAD_RESULT);
  deleteMock.mockResolvedValue(undefined);
  mCreate.mockImplementation(async ({ data }: any) => ({ id: "e1", ...data }));
  // RA-7090 slice 2 (P1): these fixtures submit UNSIGNED bytes to exercise the
  // hash-recompute / compensation / idempotency / size mechanics, which are
  // orthogonal to the signing policy. The production default is now fail-CLOSED
  // (unsigned multipart REJECTED); the explicit fail-closed rejection is proven
  // in its own describe below. Here we opt into policy-OFF so the mechanics
  // stay covered. (This is the "TEST/DEV env where legacy unsigned fixtures are
  // intentional" case.)
  process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
});

afterEach(() => {
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
});

describe("POST /evidence (multipart, RA-7090)", () => {
  it("accepts a valid upload and persists the SERVER-recomputed hash, not the storage or client claim", async () => {
    const res = await POST(
      multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
      params,
    );
    expect(res.status).toBe(201);

    // Uploaded buffer is byte-identical to what was hashed.
    const uploadedBuffer = uploadMock.mock.calls[0][0].buffer as Buffer;
    expect(uploadedBuffer.equals(Buffer.from(FIXTURE_BYTES))).toBe(true);

    // Persisted hash is recomputed over those exact bytes — NOT the storage
    // provider's differing sha256 claim.
    const created = mCreate.mock.calls[0][0].data;
    expect(created.hashSha256).toBe(FIXTURE_SHA256);
    expect(created.hashSha256).not.toBe(UPLOAD_RESULT.sha256);
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
    const created = mCreate.mock.calls[0][0].data;
    expect(created.hashSha256).toBe(FIXTURE_SHA256);
    expect(created.hashSha256).not.toBe(UPLOAD_RESULT.sha256);
  });

  it("overwrites a forged c2paManifest.sha256 with the server-verified hash", async () => {
    // Valid bytes + valid outer hash, but the manifest INSIDE structuredData
    // claims a different sha256 — must not survive into the legal record.
    const form = baseForm(FIXTURE_BYTES, FIXTURE_SHA256);
    form.set(
      "structuredData",
      JSON.stringify({
        c2paManifest: {
          capturedAt: "2026-07-25T00:00:00.000Z",
          sha256: "forged-divergent-manifest-hash",
          lat: -33.8688,
          lng: 151.2093,
        },
      }),
    );

    const res = await POST(multipartRequest(form), params);
    expect(res.status).toBe(201);
    const structured = JSON.parse(mCreate.mock.calls[0][0].data.structuredData);
    expect(structured.c2paManifest.sha256).toBe(FIXTURE_SHA256);
    // Other manifest fields survive.
    expect(structured.c2paManifest.capturedAt).toBe("2026-07-25T00:00:00.000Z");
  });

  it("rejects files that are not images by magic bytes", async () => {
    const notAnImage = new TextEncoder().encode("plain text pretending");
    const res = await POST(multipartRequest(baseForm(notAnImage)), params);
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  describe("compensation (commit-aware, round 3)", () => {
    function provablyUncommittedError() {
      const err: any = new Error("Unique constraint failed");
      err.code = "P2002";
      return err;
    }

    it("deletes all three objects (with correct buckets) when the create PROVABLY did not commit", async () => {
      mCreate.mockRejectedValueOnce(provablyUncommittedError());

      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      // fromException maps a P2002 unique violation to 409 CONFLICT.
      expect(res.status).toBe(409);

      // Full [path, bucket] tuples — a swapped-bucket regression must fail.
      const calls = deleteMock.mock.calls.map((c: any[]) => [c[0], c[1]]);
      expect(calls).toContainEqual([
        UPLOAD_RESULT.storagePath,
        BUCKET_ORIGINALS,
      ]);
      expect(calls).toContainEqual([
        UPLOAD_RESULT.compressedPath,
        BUCKET_OPTIMISED,
      ]);
      expect(calls).toContainEqual([
        UPLOAD_RESULT.thumbnailPath,
        BUCKET_OPTIMISED,
      ]);
      expect(deleteMock).toHaveBeenCalledTimes(3);
    });

    it("RETAINS storage on an ambiguous failure (row may have committed) and logs paths for GC", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        // Connection drop / timeout: Prisma throws but Postgres may have
        // committed the INSERT — deleting bytes here would make a surviving
        // custody row permanently unverifiable.
        mCreate.mockRejectedValueOnce(new Error("DB timeout"));

        const res = await POST(
          multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
          params,
        );
        expect(res.status).toBe(500);
        expect(deleteMock).not.toHaveBeenCalled();

        // Structured log carries every path an async GC sweep needs.
        const gcLog = errorSpy.mock.calls.find(([msg]) =>
          String(msg).includes("storage RETAINED"),
        );
        expect(gcLog).toBeDefined();
        const payload = gcLog![1] as any;
        // Exact {path, bucket} pairs — real bucket names, original included.
        expect(payload.paths).toContainEqual({
          path: UPLOAD_RESULT.storagePath,
          bucket: BUCKET_ORIGINALS,
        });
        expect(payload.paths).toContainEqual({
          path: UPLOAD_RESULT.compressedPath,
          bucket: BUCKET_OPTIMISED,
        });
        expect(payload.paths).toContainEqual({
          path: UPLOAD_RESULT.thumbnailPath,
          bucket: BUCKET_OPTIMISED,
        });
        expect(payload.fileSha256).toBe(FIXTURE_SHA256);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("logs each failed cleanup delete instead of silently discarding it", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        mCreate.mockRejectedValueOnce(provablyUncommittedError());
        deleteMock.mockRejectedValue(new Error("storage unavailable"));

        const res = await POST(
          multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
          params,
        );
        // fromException maps a P2002 unique violation to 409 CONFLICT.
        expect(res.status).toBe(409);

        const cleanupLogs = errorSpy.mock.calls.filter(([msg]) =>
          String(msg).includes("cleanup delete failed"),
        );
        expect(cleanupLogs).toHaveLength(3);
        const loggedPairs = cleanupLogs.map((c) => ({
          path: (c[1] as any).path,
          bucket: (c[1] as any).bucket,
        }));
        expect(loggedPairs).toContainEqual({
          path: UPLOAD_RESULT.storagePath,
          bucket: BUCKET_ORIGINALS,
        });
        expect(loggedPairs).toContainEqual({
          path: UPLOAD_RESULT.compressedPath,
          bucket: BUCKET_OPTIMISED,
        });
        expect(loggedPairs).toContainEqual({
          path: UPLOAD_RESULT.thumbnailPath,
          bucket: BUCKET_OPTIMISED,
        });
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  it.each([
    ["a string", JSON.stringify({ c2paManifest: "not-an-object" })],
    ["an array", JSON.stringify({ c2paManifest: ["sneaky", "array"] })],
  ])(
    "normalises a c2paManifest that is %s instead of letting it bypass the server hash",
    async (_label, structuredDataRaw) => {
      const form = baseForm(FIXTURE_BYTES, FIXTURE_SHA256);
      form.set("structuredData", structuredDataRaw);

      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(201);
      const structured = JSON.parse(
        mCreate.mock.calls[0][0].data.structuredData,
      );
      expect(structured.c2paManifest).toEqual({ sha256: FIXTURE_SHA256 });
    },
  );

  describe("idempotency (real withIdempotencyFingerprint)", () => {
    const KEY = "evidence-ra7090-fixture-key";

    it("replays the cached 201 for same key + same bytes without a second write", async () => {
      const first = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256), KEY),
        params,
      );
      expect(first.status).toBe(201);

      const second = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256), KEY),
        params,
      );
      expect(second.status).toBe(201);
      expect(second.headers.get("Idempotent-Replayed")).toBe("true");

      // One upload, one DB write — the retry did not duplicate evidence.
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(mCreate).toHaveBeenCalledTimes(1);
    });

    it("returns 409 for same key + different bytes", async () => {
      const first = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256), KEY),
        params,
      );
      expect(first.status).toBe(201);

      const different = Uint8Array.from(FIXTURE_BYTES);
      different[different.length - 1] ^= 0xff;
      const second = await POST(
        multipartRequest(baseForm(different), KEY),
        params,
      );
      expect(second.status).toBe(409);
      expect(mCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("size guard (20 MB boundary)", () => {
    function jpegOfSize(size: number): Uint8Array {
      const bytes = new Uint8Array(size);
      bytes[0] = 0xff;
      bytes[1] = 0xd8;
      bytes[2] = 0xff;
      return bytes;
    }

    it("accepts a file of exactly 20 MiB", async () => {
      const res = await POST(
        multipartRequest(baseForm(jpegOfSize(20 * 1024 * 1024))),
        params,
      );
      expect(res.status).toBe(201);
    });

    it("rejects a file of 20 MiB + 1 byte with 413 before buffering", async () => {
      const res = await POST(
        multipartRequest(baseForm(jpegOfSize(20 * 1024 * 1024 + 1))),
        params,
      );
      expect(res.status).toBe(413);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    });
  });

  describe("authz", () => {
    it("returns 401 when unauthenticated", async () => {
      mSession.mockResolvedValueOnce(null);
      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      expect(res.status).toBe(401);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("returns the tenancy status for a wrong-tenant inspection", async () => {
      mTenancy.mockResolvedValueOnce({
        ok: false,
        reason: "Inspection not found",
        status: 404,
      });
      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      expect(res.status).toBe(404);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    });
  });

  // RA-7090 slice 2 (P1): the fail-closed contract. A multipart upload
  // carries real bytes and is the SAME evidence class as the signed path, so
  // an UNSIGNED multipart submission MUST be rejected once the policy is ON —
  // never accepted and silently stamped unsigned.
  describe("fail-closed: unsigned multipart rejected under the policy", () => {
    it("REJECTS an unsigned multipart upload with 400 when the policy is ON", async () => {
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      expect(res.status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("REJECTS an unsigned multipart upload by DEFAULT (config unset ⇒ fail-closed ON)", async () => {
      delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      expect(res.status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    });
  });

  describe("JSON path (metadata-only, schema-correct after Opus #6)", () => {
    function jsonRequest(body: Record<string, unknown>) {
      return new NextRequest("http://localhost/api/inspections/i1/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("creates a schema-valid record: required title set, notes mapped to description", async () => {
      const res = await POST(
        jsonRequest({
          evidenceClass: "TECHNICIAN_NOTE",
          notes: "text-only evidence",
        }),
        params,
      );
      expect(res.status).toBe(201);
      const created = mCreate.mock.calls[0][0].data;
      // `title` is required by prisma/schema.prisma — the old `as any`
      // create omitted it (and wrote a nonexistent `notes` column), so
      // every production create on this path 500'd.
      expect(created.title).toBe("TECHNICIAN_NOTE");
      expect(created.description).toBe("text-only evidence");
      expect("notes" in created).toBe(false);
    });

    it("honours an explicit title", async () => {
      await POST(
        jsonRequest({
          evidenceClass: "TECHNICIAN_NOTE",
          title: "North wall observation",
          notes: "damp along skirting",
        }),
        params,
      );
      expect(mCreate.mock.calls[0][0].data.title).toBe(
        "North wall observation",
      );
    });

    it("rejects an invalid evidenceClass with 400", async () => {
      const res = await POST(
        jsonRequest({ evidenceClass: "NOT_A_REAL_CLASS", notes: "x" }),
        params,
      );
      expect(res.status).toBe(400);
      expect(mCreate).not.toHaveBeenCalled();
    });

    // Under policy OFF (beforeEach) an unsigned metadata record is accepted;
    // forged DB-column fields never reach the create because the route maps
    // only known columns. (Under policy ON the whole submission is rejected —
    // proven in route.test.ts.)
    it("ignores forged integrity/verification/status fields from the client", async () => {
      const res = await POST(
        jsonRequest({
          evidenceClass: "TECHNICIAN_NOTE",
          notes: "text-only evidence",
          // Forgery attempts — none may reach the create.
          hashSha256: "attacker-controlled-value",
          status: "ACTIVE",
          isVerified: true,
          verifiedById: "attacker",
          verifiedAt: "2026-07-25T00:00:00.000Z",
        }),
        params,
      );
      expect(res.status).toBe(201);
      const created = mCreate.mock.calls[0][0].data;
      expect(created.hashSha256).toBeUndefined();
      expect(created.status).toBeUndefined();
      expect(created.isVerified).toBeUndefined();
      expect(created.verifiedById).toBeUndefined();
      expect(created.verifiedAt).toBeUndefined();
    });
  });
});
