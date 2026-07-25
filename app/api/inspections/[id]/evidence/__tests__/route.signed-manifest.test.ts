/**
 * RA-7090 slice 2: Ed25519 signed-manifest verification on the multipart
 * evidence path. Ticket-required negative matrix:
 *   - altered bytes        → 400 (manifest hash ≠ server-computed hash)
 *   - altered manifest     → 400 (signature fails over canonical bytes)
 *   - unknown key          → 403
 *   - revoked key          → 403
 * plus: another user's key → 403, context mismatch → 400, happy path
 * persists manifest + signature + keyId with signedManifestVerified=true,
 * and an unsigned submission can never present as signed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto, { createHash } from "crypto";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  resolveInspectionWrite: vi.fn(),
}));

// In-memory idempotencyRecord fake — same contract as the slice-1 suite.
const idemStore = new Map<string, any>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: { create: vi.fn() },
    deviceSigningKey: { findUnique: vi.fn(), update: vi.fn() },
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
      deleteMany: vi.fn(async () => ({ count: 0 })),
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
import { prisma } from "@/lib/prisma";
import { canonicalizeManifest } from "@/lib/evidence/manifest-canonical";
import type { SignedEvidenceManifest } from "@/lib/evidence/manifest-canonical";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mCreate = prisma.evidenceItem.create as unknown as ReturnType<
  typeof vi.fn
>;
const mKeyFind = prisma.deviceSigningKey.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mKeyUpdate = prisma.deviceSigningKey.update as unknown as ReturnType<
  typeof vi.fn
>;

// ─── Fixtures ───────────────────────────────────────────────────────────────
const FIXTURE_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x52, 0x41, 0x2d, 0x37, 0x30, 0x39, 0x30,
]);
const FIXTURE_SHA256 = createHash("sha256")
  .update(Buffer.from(FIXTURE_BYTES))
  .digest("hex");

const DEVICE_KEYS = crypto.generateKeyPairSync("ed25519");
const DEVICE_PEM = DEVICE_KEYS.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const KEY_ID = createHash("sha256")
  .update(DEVICE_KEYS.publicKey.export({ format: "der", type: "spki" }))
  .digest("hex")
  .slice(0, 16);

const REGISTERED_KEY_ROW = {
  id: "dk1",
  userId: "u1",
  publicKeyId: KEY_ID,
  publicKeyPem: DEVICE_PEM,
  deviceUuid: null,
  devicePlatform: "ios",
  createdAt: new Date("2026-07-20T00:00:00.000Z"),
  revokedAt: null as Date | null,
  lastUsedAt: null as Date | null,
};

const UPLOAD_RESULT = {
  compressedUrl: "https://storage/evidence/x-compressed.jpg",
  thumbnailUrl: "https://storage/evidence/x-thumb.jpg",
  storagePath: "evidence/x-original.jpg",
  compressedPath: "evidence/x-compressed.jpg",
  thumbnailPath: "evidence/x-thumb.jpg",
  sha256: "deadbeef-storage-provider-claim-not-authoritative",
  sizeBytes: FIXTURE_BYTES.length,
};

function manifestFixture(
  overrides: Partial<SignedEvidenceManifest> = {},
): SignedEvidenceManifest {
  return {
    inspectionId: "i1",
    workflowStepId: "step1",
    evidenceClass: "PHOTO_DAMAGE",
    capturedAt: "2026-07-25T00:00:00.000Z",
    gps: { lat: -33.8688, lng: 151.2093, accuracy: 5.2 },
    userId: "u1",
    deviceKeyId: KEY_ID,
    sha256: FIXTURE_SHA256,
    ...overrides,
  };
}

function signCanonical(json: string): string {
  return crypto
    .sign(null, Buffer.from(json, "utf8"), DEVICE_KEYS.privateKey)
    .toString("base64");
}

function signedForm(
  manifest: SignedEvidenceManifest,
  options: {
    bytes?: Uint8Array;
    manifestJson?: string;
    signature?: string | null;
  } = {},
) {
  const bytes = options.bytes ?? FIXTURE_BYTES;
  const manifestJson = options.manifestJson ?? canonicalizeManifest(manifest);
  const form = new FormData();
  form.append(
    "file",
    new File([bytes], "capture-1.jpeg", { type: "image/jpeg" }),
  );
  form.append("evidenceClass", "PHOTO_DAMAGE");
  form.append("workflowStepId", "step1");
  form.append("deviceType", "IOS_CAPACITOR");
  form.append(
    "structuredData",
    JSON.stringify({ c2paManifest: { sha256: manifest.sha256 } }),
  );
  form.append("signedManifest", manifestJson);
  if (options.signature !== null) {
    form.append("manifestSignature", options.signature ?? signCanonical(manifestJson));
  }
  return form;
}

function multipartRequest(form: FormData) {
  return new NextRequest("http://localhost/api/inspections/i1/evidence", {
    method: "POST",
    body: form,
  });
}

const params = { params: Promise.resolve({ id: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  idemStore.clear();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech One" } });
  uploadMock.mockResolvedValue(UPLOAD_RESULT);
  deleteMock.mockResolvedValue(undefined);
  mCreate.mockImplementation(async ({ data }: any) => ({ id: "e1", ...data }));
  mKeyFind.mockResolvedValue(REGISTERED_KEY_ROW);
  mKeyUpdate.mockResolvedValue({ ...REGISTERED_KEY_ROW, lastUsedAt: new Date() });
});

describe("POST /evidence — Ed25519 signed manifest (RA-7090 slice 2)", () => {
  it("verifies a signed capture end-to-end and persists manifest + signature + keyId as VERIFIED", async () => {
    const manifest = manifestFixture();
    const manifestJson = canonicalizeManifest(manifest);
    const signature = signCanonical(manifestJson);

    const res = await POST(
      multipartRequest(signedForm(manifest, { manifestJson, signature })),
      params,
    );
    expect(res.status).toBe(201);

    expect(mKeyFind).toHaveBeenCalledWith({ where: { publicKeyId: KEY_ID } });

    const created = mCreate.mock.calls[0][0].data;
    expect(created.hashSha256).toBe(FIXTURE_SHA256);
    const structured = JSON.parse(created.structuredData);
    expect(structured.signedManifestVerified).toBe(true);
    expect(structured.c2paManifest).toEqual({
      ...manifest,
      sha256: FIXTURE_SHA256, // server-computed, binding-checked equal
      signature,
      algorithm: "Ed25519",
    });

    // Key-usage bookkeeping.
    expect(mKeyUpdate).toHaveBeenCalledWith({
      where: { publicKeyId: KEY_ID },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("ALTERED BYTES: a validly signed manifest over different bytes is rejected 400, nothing stored", async () => {
    // Manifest correctly signed — but over a hash that is NOT the uploaded
    // bytes (no outer sha256 form field, so this is the manifest-vs-server
    // binding check, not the slice-1 transit check).
    const manifest = manifestFixture({ sha256: "b".repeat(64) });

    const res = await POST(multipartRequest(signedForm(manifest)), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("does not match uploaded bytes");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("ALTERED MANIFEST: tampering any field after signing fails the signature (400)", async () => {
    const manifest = manifestFixture();
    const signature = signCanonical(canonicalizeManifest(manifest));
    // Attacker edits the GPS fix after signing.
    const tamperedJson = canonicalizeManifest({
      ...manifest,
      gps: { lat: -27.4698, lng: 153.0251, accuracy: 5.2 },
    });

    const res = await POST(
      multipartRequest(
        signedForm(manifest, { manifestJson: tamperedJson, signature }),
      ),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("signature verification failed");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("UNKNOWN KEY: manifest naming an unregistered key id is rejected 403", async () => {
    mKeyFind.mockResolvedValueOnce(null);
    const res = await POST(
      multipartRequest(signedForm(manifestFixture())),
      params,
    );
    expect(res.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("REVOKED KEY: a revoked device key can no longer produce accepted manifests (403)", async () => {
    mKeyFind.mockResolvedValueOnce({
      ...REGISTERED_KEY_ROW,
      revokedAt: new Date("2026-07-24T00:00:00.000Z"),
    });
    const res = await POST(
      multipartRequest(signedForm(manifestFixture())),
      params,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("revoked");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("ANOTHER USER'S KEY: a key registered to someone else is rejected 403", async () => {
    mKeyFind.mockResolvedValueOnce({
      ...REGISTERED_KEY_ROW,
      userId: "someone-else",
    });
    const res = await POST(
      multipartRequest(signedForm(manifestFixture())),
      params,
    );
    expect(res.status).toBe(403);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["inspectionId", manifestFixture({ inspectionId: "other-inspection" })],
    ["evidenceClass", manifestFixture({ evidenceClass: "PHOTO_MOISTURE" })],
    ["userId", manifestFixture({ userId: "someone-else" })],
    ["workflowStepId", manifestFixture({ workflowStepId: "other-step" })],
  ])(
    "CONTEXT MISMATCH on %s: a validly signed manifest for a different context is rejected 400",
    async (_field, manifest) => {
      const res = await POST(multipartRequest(signedForm(manifest)), params);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(JSON.stringify(body)).toContain("bound to a different");
      expect(mCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects a signedManifest without a signature (400)", async () => {
    const res = await POST(
      multipartRequest(signedForm(manifestFixture(), { signature: null })),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("must both be supplied");
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("rejects a signedManifest that is not valid JSON / not an object (400)", async () => {
    for (const bad of ["not json {", JSON.stringify(["array"])]) {
      const form = signedForm(manifestFixture(), {
        manifestJson: bad,
        signature: signCanonical(bad),
      });
      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(400);
    }
    expect(mCreate).not.toHaveBeenCalled();
  });

  describe("unsigned submissions can never present as signed", () => {
    function unsignedForm(structuredData?: Record<string, unknown>) {
      const form = new FormData();
      form.append(
        "file",
        new File([FIXTURE_BYTES], "capture-1.jpeg", { type: "image/jpeg" }),
      );
      form.append("evidenceClass", "PHOTO_DAMAGE");
      form.append("workflowStepId", "step1");
      if (structuredData) {
        form.append("structuredData", JSON.stringify(structuredData));
      }
      return form;
    }

    it("a plain unsigned upload stays accepted (backwards compatible) with signedManifestVerified=false", async () => {
      const res = await POST(
        multipartRequest(
          unsignedForm({ c2paManifest: { sha256: FIXTURE_SHA256 } }),
        ),
        params,
      );
      expect(res.status).toBe(201);
      const structured = JSON.parse(
        mCreate.mock.calls[0][0].data.structuredData,
      );
      expect(structured.signedManifestVerified).toBe(false);
      expect(structured.c2paManifest.signature).toBeUndefined();
      expect(mKeyFind).not.toHaveBeenCalled();
      expect(mKeyUpdate).not.toHaveBeenCalled();
    });

    it("a FORGED signedManifestVerified claim inside structuredData is overwritten to false", async () => {
      const res = await POST(
        multipartRequest(
          unsignedForm({
            signedManifestVerified: true,
            c2paManifest: {
              sha256: FIXTURE_SHA256,
              signature: "forged-signature",
              deviceKeyId: KEY_ID,
              algorithm: "Ed25519",
            },
          }),
        ),
        params,
      );
      expect(res.status).toBe(201);
      const structured = JSON.parse(
        mCreate.mock.calls[0][0].data.structuredData,
      );
      // The server-set flag wins — no signature was ever verified.
      expect(structured.signedManifestVerified).toBe(false);
    });
  });
});
