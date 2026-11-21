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
// The sync-ledger workspace lookup (RA-7586) is covered in route.test.ts.
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: async () => null,
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  // RA-7721: POST gates on the capture reach.
  assertInspectionCapturable: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  assertInspectionTenancy: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
}));

// In-memory fake of the idempotencyRecord table — faithful to the contract
// the real lib/idempotency.ts relies on: unique cacheKey (P2002 on dupe),
// findUnique, update, deleteMany.
const idemStore = new Map<string, any>();
// RA-8388: the multipart writer now writes the EvidenceItem and the
// InspectionPhoto row in ONE transaction, so this mock needs a real
// `$transaction`. The transaction client delegates to the SAME vi.fn
// instances the assertions below reach through `prisma.evidenceItem.create`,
// so every existing expectation keeps testing the write that actually
// happened rather than a second, parallel mock.
const dbMocks = vi.hoisted(() => ({
  evidenceItem: { create: vi.fn() },
  inspectionPhoto: {
    create: vi.fn(async ({ data }: any) => data),
  },
  moistureReading: { create: vi.fn(async ({ data }: any) => data) },
  environmentalData: { create: vi.fn(async ({ data }: any) => data) },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: dbMocks.evidenceItem,
    inspectionPhoto: dbMocks.inspectionPhoto,
    moistureReading: dbMocks.moistureReading,
    environmentalData: dbMocks.environmentalData,
    $transaction: vi.fn(async (fn: any) => fn(dbMocks)),
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
      // Completion updates only its own PENDING reservation for the same fingerprint.
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rec = idemStore.get(where.cacheKey);
        if (!rec || (where.id && rec.id !== where.id) ||
            (where.status && rec.status !== where.status) ||
            (where.fingerprint && rec.fingerprint !== where.fingerprint)) return { count: 0 };
        Object.assign(rec, data);
        return { count: 1 };
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
import { assertInspectionCapturable } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { BUCKET_OPTIMISED, BUCKET_ORIGINALS } from "@/lib/storage/types";
import { EvidenceClass } from "@prisma/client";
import {
  evidenceClassAllowedOnPath,
  wrongSubmissionPathMessage,
} from "@/lib/evidence/submission-path-classes";
import { expectRefused } from "@/tests/helpers/expect-refused";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionCapturable as unknown as ReturnType<typeof vi.fn>;
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
        // RA-8388: 409, NOT 500. This asserted 500 until the retry contract
        // was traced through: `withIdempotency` deletes its PENDING
        // reservation on any 5xx (lib/idempotency.ts:433-441), so answering
        // an AMBIGUOUS commit with 500 hands the retry a fresh slot and it
        // uploads the same photograph a second time - giving the completion
        // gate two InspectionPhoto rows for one photograph, both signed.
        //
        // The bytes are retained here because the row may exist; the
        // reservation is retained for exactly the same reason, and the
        // header is what stops the 409 being cached as the final answer.
        expect(res.status).toBe(409);
        expect(
          res.headers.get("X-RestoreAssist-Idempotency-Uncertain"),
        ).toBe("true");
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

  describe("video walkthrough evidence", () => {
    // ISO-BMFF header: 4-byte box size, then "ftyp" + brand.
    const MP4 = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86]);

    function videoForm(bytes: Uint8Array, evidenceClass: string, type = "video/mp4") {
      const form = baseForm(bytes);
      form.set("file", new File([bytes], "walkthrough.mp4", { type }));
      form.set("evidenceClass", evidenceClass);
      return form;
    }

    it("accepts an MP4 for VIDEO_WALKTHROUGH and stores it as video", async () => {
      const res = await POST(
        multipartRequest(videoForm(MP4, "VIDEO_WALKTHROUGH")),
        params,
      );
      expect(res.status).toBe(201);
      expect(uploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "video/mp4" }),
      );
    });

    it("accepts a WebM for VIDEO_WALKTHROUGH", async () => {
      const res = await POST(
        multipartRequest(videoForm(WEBM, "VIDEO_WALKTHROUGH", "video/webm")),
        params,
      );
      expect(res.status).toBe(201);
    });

    it("rejects a video sent as a photo class", async () => {
      const res = await POST(
        multipartRequest(videoForm(MP4, "PHOTO_DAMAGE")),
        params,
      );
      expect(res.status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it("rejects a HEIC still (ISO-BMFF ftyp, image brand) sent as a video walkthrough", async () => {
      const HEIC = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      ]);
      const res = await POST(
        multipartRequest(videoForm(HEIC, "VIDEO_WALKTHROUGH", "image/heic")),
        params,
      );
      expect(res.status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it("rejects a still image sent as a video walkthrough", async () => {
      const form = baseForm(FIXTURE_BYTES);
      form.set("evidenceClass", "VIDEO_WALKTHROUGH");
      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it("allows video over the 20 MB photo cap but rejects over 100 MiB", async () => {
      const big = new Uint8Array(20 * 1024 * 1024 + 1);
      big.set(MP4);
      const ok = await POST(
        multipartRequest(videoForm(big, "VIDEO_WALKTHROUGH")),
        params,
      );
      expect(ok.status).toBe(201);

      const tooBig = new Uint8Array(100 * 1024 * 1024 + 1);
      tooBig.set(MP4);
      uploadMock.mockClear();
      const res = await POST(
        multipartRequest(videoForm(tooBig, "VIDEO_WALKTHROUGH")),
        params,
      );
      expect(res.status).toBe(413);
      expect(uploadMock).not.toHaveBeenCalled();
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

/**
 * RA-8388 bench round 1: ONE photograph rule.
 *
 * The route decided "is this a photograph" from the raw declared type and
 * stored a defaulted one, while the backfill read the stored value. A JPEG
 * whose part declared no type was saved, never counted, and would later be
 * counted by the backfill: two writers, two rules. The route now stores and
 * decides from the type its own magic-byte check proved.
 */
describe("POST /evidence (multipart): one photograph rule (RA-8388)", () => {
  const mPhotoCreate = prisma.inspectionPhoto.create as unknown as ReturnType<
    typeof vi.fn
  >;
  const mTransaction = prisma.$transaction as unknown as ReturnType<
    typeof vi.fn
  >;
  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
  ]);

  function formWithFile(bytes: Uint8Array, declaredType: string) {
    const form = new FormData();
    form.append("file", new File([bytes], "capture-1", { type: declaredType }));
    form.append("evidenceClass", "PHOTO_DAMAGE");
    form.append("workflowStepId", "step1");
    return form;
  }

  it("a verified JPEG that declares no type is stored as image/jpeg and counted", async () => {
    // A blob with an empty type is what the web picker can hand over. The
    // multipart encoding turns that into "application/octet-stream" by the
    // time the server reads the part, so this is the shape the fault takes
    // on the wire: a real JPEG, a declared type that is not image/*.
    const res = await POST(
      multipartRequest(formWithFile(FIXTURE_BYTES, "")),
      params,
    );
    expect(res.status).toBe(201);

    // The row the submit gate counts exists.
    expect(mPhotoCreate).toHaveBeenCalledTimes(1);
    // And all three places that record the type say what the bytes proved.
    expect(mCreate.mock.calls[0][0].data.fileMimeType).toBe("image/jpeg");
    expect(mPhotoCreate.mock.calls[0][0].data.mimeType).toBe("image/jpeg");
    expect(uploadMock.mock.calls[0][0].mimeType).toBe("image/jpeg");
  });

  it("a verified PNG declared as something else is stored as image/png and counted", async () => {
    const res = await POST(
      multipartRequest(formWithFile(PNG_BYTES, "application/octet-stream")),
      params,
    );
    expect(res.status).toBe(201);

    expect(mPhotoCreate).toHaveBeenCalledTimes(1);
    expect(mCreate.mock.calls[0][0].data.fileMimeType).toBe("image/png");
    expect(mPhotoCreate.mock.calls[0][0].data.mimeType).toBe("image/png");
  });

  it("the backfill reaches the SAME decision from what the route stored", async () => {
    // The parity control. Whatever the route decided at capture time, the
    // backfill must decide from the stored record: a row the route refused
    // must not be written later, and a row it wrote must have been due.
    //
    // A control, not the red guard for this fix: it also held on the old
    // code for these inputs (both sides refused the untyped JPEG). The two
    // tests above are the ones that failed first. This one fails if the two
    // writers are ever given different inputs again.
    const { decideBackfill } = await import(
      "@/scripts/lib/backfill-evidence-authoritative-rows"
    );
    for (const [bytes, declared] of [
      [FIXTURE_BYTES, ""],
      [FIXTURE_BYTES, "image/jpeg"],
      [PNG_BYTES, "application/octet-stream"],
    ] as Array<[Uint8Array, string]>) {
      mCreate.mockClear();
      mPhotoCreate.mockClear();
      const res = await POST(
        multipartRequest(formWithFile(bytes, declared)),
        params,
      );
      expect(res.status).toBe(201);
      const stored = mCreate.mock.calls[0][0].data;
      const routeCounted = mPhotoCreate.mock.calls.length === 1;

      const decision = decideBackfill(
        {
          id: "e1",
          inspectionId: "i1",
          evidenceClass: stored.evidenceClass,
          description: null,
          roomName: null,
          structuredData: stored.structuredData,
          capturedAt: stored.capturedAt,
          capturedLat: null,
          capturedLng: null,
          fileUrl: stored.fileUrl,
          thumbnailUrl: stored.thumbnailUrl,
          fileMimeType: stored.fileMimeType,
          fileSizeBytes: stored.fileSizeBytes,
          matchesClientSubmission: false,
        },
        {
          linkedEvidenceIds: new Set<string>(),
          photoUrls: new Set<string>(),
          moistureFingerprints: new Set<string>(),
          environmentalFingerprints: new Set<string>(),
        },
      );
      expect([declared, decision.kind === "write"]).toEqual([
        declared,
        routeCounted,
      ]);
    }
  });

  it("the 201 says the photograph counts toward submission", async () => {
    const res = await POST(
      multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
      params,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.countsTowardSubmission).toBe(true);
  });

  describe("the transaction that never started", () => {
    function p2028(message: string) {
      const err: any = new Error(`Transaction API error: ${message}`);
      err.code = "P2028";
      return err;
    }

    it("gives the two-row write explicit wait and run limits", async () => {
      await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );
      expect(mTransaction).toHaveBeenCalledTimes(1);
      expect(mTransaction.mock.calls[0][1]).toEqual({
        maxWait: expect.any(Number),
        timeout: expect.any(Number),
      });
    });

    it("a P2028 raised before the transaction started is NOT 'may already have been saved'", async () => {
      // No connection was free inside the wait limit, so no statement ran.
      // Nothing can have committed: the bytes are cleaned up and the
      // technician is free to retry at once.
      mTransaction.mockRejectedValueOnce(
        p2028("Unable to start a transaction in the given time."),
      );

      const res = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
        params,
      );

      expect(res.status).not.toBe(409);
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBeNull();
      expect(deleteMock).toHaveBeenCalledTimes(3);
    });

    it("the same photograph can be sent again at once after a transaction that never started", async () => {
      // The point of the fix, on the keyed path a real capture uses: the
      // reservation is released, so the retry with the SAME key and bytes is
      // written, not answered "already in progress" for the 60 second lease.
      mTransaction.mockRejectedValueOnce(
        p2028("Unable to start a transaction in the given time."),
      );
      const first = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256), "idem-p2028"),
        params,
      );
      expect(first.status).toBeGreaterThanOrEqual(500);

      const retry = await POST(
        multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256), "idem-p2028"),
        params,
      );
      expect(retry.status).toBe(201);
      expect(mPhotoCreate).toHaveBeenCalledTimes(1);
    });

    it("any OTHER P2028 is still ambiguous: 409, bytes retained", async () => {
      // The negative control. A transaction that expired after it started
      // may have run its inserts, so it keeps the careful answer.
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        mTransaction.mockRejectedValueOnce(
          p2028(
            "A commit cannot be executed on an expired transaction. The timeout for this transaction was 10000 ms, however 10050 ms passed since the start of the transaction.",
          ),
        );

        const res = await POST(
          multipartRequest(baseForm(FIXTURE_BYTES, FIXTURE_SHA256)),
          params,
        );

        expect(res.status).toBe(409);
        expect(
          res.headers.get("X-RestoreAssist-Idempotency-Uncertain"),
        ).toBe("true");
        expect(deleteMock).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});

// RA-8388, founder ruling 17/11/2026. The file path stores a file and has no
// typed values, so it cannot build the record behind a note or reading. Every
// class is tried, so a class added to the schema later is covered on the day
// it is added.
describe("POST /evidence (multipart): one path per evidence class (RA-8388)", () => {
  const classes = Object.values(EvidenceClass);
  const notForFiles = classes.filter(
    (cls) => !evidenceClassAllowedOnPath(cls, "file"),
  );
  const forFiles = classes.filter((cls) =>
    evidenceClassAllowedOnPath(cls, "file"),
  );
  const FILE_REFUSAL = /is a note or reading, so it cannot be sent as a file/;

  function formFor(evidenceClass: string) {
    const form = baseForm(FIXTURE_BYTES, FIXTURE_SHA256);
    form.set("evidenceClass", evidenceClass);
    return form;
  }

  it("splits the classes it is given, so neither list below is empty", () => {
    expect(notForFiles.length).toBeGreaterThan(0);
    expect(forFiles.length).toBeGreaterThan(0);
    expect(wrongSubmissionPathMessage("file")).toMatch(FILE_REFUSAL);
  });

  it.each(notForFiles)(
    "refuses %s sent as a file and stores nothing",
    async (evidenceClass) => {
      const res = await POST(multipartRequest(formFor(evidenceClass)), params);
      await expectRefused(res, 400, FILE_REFUSAL);
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mCreate).not.toHaveBeenCalled();
    },
  );

  // RA-8407 item 2: "not turned away" was all this used to assert, which a
  // 500 or a refusal for some other reason also satisfies. An accepted class
  // must be stored: 201, a type that fits the class, and metadata that tells
  // the truth. These uploads are unsigned (policy OFF in beforeEach), so the
  // truth is "not verified" with the server's own hash. The expected kind is
  // written out here rather than read from the module under test.
  const MP4_BYTES = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const OGG_BYTES = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0, 0]);
  const KIND_FIXTURE = {
    image: { bytes: FIXTURE_BYTES, declared: "image/jpeg", stored: /^image\/jpeg$/ },
    video: { bytes: MP4_BYTES, declared: "video/mp4", stored: /^video\// },
    audio: { bytes: OGG_BYTES, declared: "audio/ogg", stored: /^audio\// },
  } as const;
  const KIND_FOR_CLASS = (cls: string): keyof typeof KIND_FIXTURE =>
    cls === "VIDEO_WALKTHROUGH" ? "video" : cls === "VOICE_MEMO" ? "audio" : "image";

  it.each(forFiles)(
    "stores %s sent as a file of its own kind: 201, a fitting type, truthful metadata",
    async (evidenceClass) => {
      const fixture = KIND_FIXTURE[KIND_FOR_CLASS(evidenceClass)];
      const form = new FormData();
      form.append(
        "file",
        new File([fixture.bytes], "capture-1", { type: fixture.declared }),
      );
      form.append("evidenceClass", evidenceClass);
      form.append("workflowStepId", "step1");
      const res = await POST(multipartRequest(form), params);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toMatch(FILE_REFUSAL);
      expect(res.status).toBe(201);

      expect(mCreate).toHaveBeenCalledTimes(1);
      const created = mCreate.mock.calls[0][0].data;
      expect(created.evidenceClass).toBe(evidenceClass);
      expect(created.fileMimeType).toMatch(fixture.stored);
      expect(uploadMock.mock.calls[0][0].mimeType).toBe(created.fileMimeType);
      const serverHash = createHash("sha256")
        .update(Buffer.from(fixture.bytes))
        .digest("hex");
      expect(created.hashSha256).toBe(serverHash);
      // Unsigned, so it must not present as verified.
      const structured = JSON.parse(created.structuredData);
      expect(structured.signedManifestVerified).toBe(false);
    },
  );

  // RA-8407: the per-class media check on this path, unsigned.
  it("refuses a VOICE_MEMO whose bytes are a JPEG and stores nothing", async () => {
    const res = await POST(multipartRequest(formFor("VOICE_MEMO")), params);
    await expectRefused(res, 400, /voice memo, but the file is not an audio recording/);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });
});
