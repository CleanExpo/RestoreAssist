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
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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
    deviceSigningKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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
const mKeyFindFirst = prisma.deviceSigningKey.findFirst as unknown as ReturnType<
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

// Keep the verifier's clock deterministic while making the normal fixture
// current-relative. This prevents a valid capture fixture from aging past the
// production 30-day freshness bound as the calendar advances.
const TEST_NOW = new Date("2026-08-25T12:00:00.000Z");
const RECENT_CAPTURE_OFFSET_MS = 24 * 60 * 60 * 1000;

beforeAll(() => {
  vi.useFakeTimers({ now: TEST_NOW });
});

afterAll(() => {
  vi.useRealTimers();
});

function manifestFixture(
  overrides: Partial<SignedEvidenceManifest> = {},
): SignedEvidenceManifest {
  return {
    inspectionId: "i1",
    workflowStepId: "step1",
    evidenceClass: "PHOTO_DAMAGE",
    capturedAt: new Date(Date.now() - RECENT_CAPTURE_OFFSET_MS).toISOString(),
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
  mKeyUpdate.mockResolvedValue({
    ...REGISTERED_KEY_ROW,
    lastUsedAt: new Date(),
  });
  // Default: the submitter has no registered key, so an unsigned submission
  // is not a downgrade.
  mKeyFindFirst.mockResolvedValue(null);
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
});

describe("POST /evidence — Ed25519 signed manifest (RA-7090 slice 2)", () => {
  // MUST-FIX 5a: every other test transmits ALREADY-CANONICAL JSON, so a
  // verifier that checked the RAW bytes (or mishandled nested key order)
  // would pass them all. This transmits a deliberately non-canonical
  // encoding of the same manifest.
  it("verifies a NON-CANONICAL transmission whose signature is over canonical bytes", async () => {
    const manifest = manifestFixture();
    const signature = signCanonical(canonicalizeManifest(manifest));

    // Reordered keys (including inside the nested gps object) plus pretty
    // whitespace — semantically identical, byte-wise very different.
    const nonCanonicalJson = JSON.stringify(
      {
        sha256: manifest.sha256,
        deviceKeyId: manifest.deviceKeyId,
        userId: manifest.userId,
        gps: {
          accuracy: manifest.gps.accuracy,
          lng: manifest.gps.lng,
          lat: manifest.gps.lat,
        },
        capturedAt: manifest.capturedAt,
        evidenceClass: manifest.evidenceClass,
        workflowStepId: manifest.workflowStepId,
        inspectionId: manifest.inspectionId,
      },
      null,
      2,
    );
    expect(nonCanonicalJson).not.toBe(canonicalizeManifest(manifest));
    expect(nonCanonicalJson).toContain("\n");

    const res = await POST(
      multipartRequest(
        signedForm(manifest, { manifestJson: nonCanonicalJson, signature }),
      ),
      params,
    );
    expect(res.status).toBe(201);
    const structured = JSON.parse(mCreate.mock.calls[0][0].data.structuredData);
    expect(structured.signedManifestVerified).toBe(true);
  });

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

  describe("MUST-FIX 2: gps + capturedAt are bound and DERIVED from the signature", () => {
    it("REJECTS Sydney-signed coordinates submitted with Melbourne form fields", async () => {
      // The exploit: manifest signed in Sydney, form fields say Melbourne.
      // Before the fix this returned 201 with signedManifestVerified:true
      // and persisted MELBOURNE — which is what the dispute pack prints.
      const manifest = manifestFixture(); // Sydney
      const form = signedForm(manifest);
      form.set("capturedLat", "-37.8136"); // Melbourne
      form.set("capturedLng", "144.9631");

      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(JSON.stringify(body)).toContain("different capture location");
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("PERSISTS the signed coordinates and capture time, not the server clock", async () => {
      const manifest = manifestFixture();
      const res = await POST(multipartRequest(signedForm(manifest)), params);
      expect(res.status).toBe(201);

      const created = mCreate.mock.calls[0][0].data;
      // These are the columns lib/dispute-pack.ts prints.
      expect(created.capturedLat).toBe(manifest.gps.lat);
      expect(created.capturedLng).toBe(manifest.gps.lng);
      expect(created.capturedAt).toEqual(new Date(manifest.capturedAt));
    });

    it("rejects a capturedAt form field that disagrees with the signed manifest", async () => {
      const form = signedForm(manifestFixture());
      form.set("capturedAt", "2026-07-24T00:00:00.000Z");
      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain(
        "different capture time",
      );
      expect(mCreate).not.toHaveBeenCalled();
    });

    // Round 2 MUST-FIX 1: fix #2 replaced the server-stamped capturedAt with
    // an UNBOUNDED client-chosen one. The clock guard was one-sided, so a
    // technician could sign a 2019 manifest over the real bytes with their
    // own registered key and have the dispute pack print that date under a
    // verified banner (proven: 201, capturedAt=2019-01-01, verified=true).
    it("REJECTS a backdated signed capture (the 2019 exploit)", async () => {
      const res = await POST(
        multipartRequest(
          signedForm(manifestFixture({ capturedAt: "2019-01-01T00:00:00.000Z" })),
        ),
        params,
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain("too far in the past");
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("ACCEPTS a realistic offline-queue delay (10 days) — the bound must not break field work", async () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const res = await POST(
        multipartRequest(signedForm(manifestFixture({ capturedAt: tenDaysAgo }))),
        params,
      );
      expect(res.status).toBe(201);
      expect(mCreate.mock.calls[0][0].data.capturedAt).toEqual(
        new Date(tenDaysAgo),
      );
    });

    it("rejects a future-dated signed capture", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await POST(
        multipartRequest(signedForm(manifestFixture({ capturedAt: future }))),
        params,
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain("future");
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("an UNSIGNED submission still uses the form-supplied coordinates (policy OFF)", async () => {
      // Byte-mechanics under an EXPLICIT policy-OFF: the fail-closed default
      // now rejects unsigned multipart (proven in its own describe below).
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
      const form = new FormData();
      form.append(
        "file",
        new File([FIXTURE_BYTES], "capture-1.jpeg", { type: "image/jpeg" }),
      );
      form.append("evidenceClass", "PHOTO_DAMAGE");
      form.append("workflowStepId", "step1");
      form.append("capturedLat", "-37.8136");
      form.append("capturedLng", "144.9631");

      const res = await POST(multipartRequest(form), params);
      expect(res.status).toBe(201);
      const created = mCreate.mock.calls[0][0].data;
      expect(created.capturedLat).toBe(-37.8136);
      expect(created.capturedLng).toBe(144.9631);
      expect(
        JSON.parse(created.structuredData).signedManifestVerified,
      ).toBe(false);
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

    // RA-7090 slice 2 (P1): the fail-closed contract replaces the old
    // "backwards compatible accepted" behaviour. A plain unsigned multipart
    // upload is now REJECTED by default (config unset ⇒ policy ON) — it can
    // never be accepted and stamped unsigned.
    it("a plain unsigned upload is REJECTED by DEFAULT (config unset ⇒ fail-closed)", async () => {
      const res = await POST(
        multipartRequest(
          unsignedForm({ c2paManifest: { sha256: FIXTURE_SHA256 } }),
        ),
        params,
      );
      expect(res.status).toBe(400);
      expect(mCreate).not.toHaveBeenCalled();
      // No key was signed with, so no key bookkeeping occurred.
      expect(mKeyUpdate).not.toHaveBeenCalled();
    });

    // MUST-FIX 1: the JSON metadata writer is LIVE (the capture page's
    // handleAddEvidence posts through it) and used to persist client
    // structuredData VERBATIM — reviewers exploited it to get a 201 whose
    // record read signedManifestVerified:true with a fabricated signature.
    describe("JSON metadata writer (the exploited path)", () => {
      function jsonRequest(body: Record<string, unknown>) {
        return new NextRequest("http://localhost/api/inspections/i1/evidence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      // Under an EXPLICIT policy-OFF, an unsigned metadata record is accepted;
      // these exercise the sanitiser + downgrade-visibility mechanics.
      describe("policy OFF (unsigned metadata accepted, sanitised)", () => {
        beforeEach(() => {
          process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
        });

        it("strips a forged signed status and signature from a plain JSON POST", async () => {
          const res = await POST(
            jsonRequest({
              evidenceClass: "TECHNICIAN_NOTE",
              notes: "text-only evidence",
              structuredData: {
                signedManifestVerified: true,
                c2paManifest: {
                  sha256: "0".repeat(64),
                  signature: "AAAA",
                  algorithm: "Ed25519",
                  deviceKeyId: KEY_ID,
                },
              },
            }),
            params,
          );
          expect(res.status).toBe(201);

          const structured = JSON.parse(
            mCreate.mock.calls[0][0].data.structuredData,
          );
          expect(structured.signedManifestVerified).toBe(false);
          expect(structured.c2paManifest.signature).toBeUndefined();
          expect(structured.c2paManifest.algorithm).toBeUndefined();
          expect(structured.c2paManifest.deviceKeyId).toBeUndefined();
          expect(structured.c2paManifest.sha256).toBeUndefined();
        });

        it("keeps benign client metadata on the JSON path", async () => {
          await POST(
            jsonRequest({
              evidenceClass: "TECHNICIAN_NOTE",
              notes: "n",
              structuredData: { readingCelsius: 21.5 },
            }),
            params,
          );
          const structured = JSON.parse(
            mCreate.mock.calls[0][0].data.structuredData,
          );
          expect(structured.readingCelsius).toBe(21.5);
          expect(structured.signedManifestVerified).toBe(false);
        });

        it("leaves structuredData null when the client sends none and has no key", async () => {
          await POST(
            jsonRequest({ evidenceClass: "TECHNICIAN_NOTE", notes: "n" }),
            params,
          );
          expect(mCreate.mock.calls[0][0].data.structuredData).toBeNull();
        });

        it("records the downgrade reason when the submitter HAS a live key", async () => {
          mKeyFindFirst.mockResolvedValueOnce({ id: "dk1" });
          await POST(
            jsonRequest({
              evidenceClass: "TECHNICIAN_NOTE",
              notes: "x",
              structuredData: { readingCelsius: 21 },
            }),
            params,
          );
          const structured = JSON.parse(
            mCreate.mock.calls[0][0].data.structuredData,
          );
          expect(structured.signedManifestDowngradeReason).toBe(
            "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
          );
        });
      });

      // P0 terminal fix: under policy ON there is NO unsigned path. The
      // metadata-only exemption (and its defeatable byte heuristic) is REMOVED,
      // so an unsigned metadata JSON submission is REJECTED regardless of
      // content — closing the whole encoding-smuggle class at the source.
      describe("policy ON (no unsigned path — rejected)", () => {
        beforeEach(() => {
          process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
        });

        it("REJECTS a plain metadata-only JSON POST with 400", async () => {
          const res = await POST(
            jsonRequest({ evidenceClass: "TECHNICIAN_NOTE", notes: "x" }),
            params,
          );
          expect(res.status).toBe(400);
          expect(mCreate).not.toHaveBeenCalled();
        });

        it("REJECTS metadata JSON carrying benign readings just the same", async () => {
          const res = await POST(
            jsonRequest({
              evidenceClass: "TECHNICIAN_NOTE",
              notes: "x",
              structuredData: { readingCelsius: 21 },
            }),
            params,
          );
          expect(res.status).toBe(400);
          expect(mCreate).not.toHaveBeenCalled();
        });
      });
    });

    // RA-7090 slice 2 (P1): the multipart writer carries real bytes, so an
    // unsigned submission is now fail-CLOSED by default. Under an EXPLICIT
    // policy-OFF the downgrade is still accepted-but-VISIBLE; the default and
    // the ON path REJECT.
    describe("downgrade visibility + fail-closed policy", () => {
      it("policy OFF records a downgrade reason when the submitter HAS a live registered key", async () => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
        mKeyFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(201);
        const structured = JSON.parse(
          mCreate.mock.calls[0][0].data.structuredData,
        );
        expect(structured.signedManifestVerified).toBe(false);
        expect(structured.signedManifestDowngradeReason).toBe(
          "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
        );
      });

      it("policy OFF records NO downgrade reason when the submitter has no key at all", async () => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(201);
        const structured = JSON.parse(
          mCreate.mock.calls[0][0].data.structuredData,
        );
        expect(structured.signedManifestDowngradeReason).toBeUndefined();
      });

      it("DEFAULT policy (config unset) REJECTS the unsigned submission (fail-closed)", async () => {
        mKeyFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(400);
        expect(mCreate).not.toHaveBeenCalled();
      });

      it("with EVIDENCE_REQUIRE_SIGNED_MANIFEST=true the downgrade is REFUSED", async () => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
        mKeyFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(400);
        expect(mCreate).not.toHaveBeenCalled();
      });

      it("policy ON fails CLOSED when the probe itself errors", async () => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
        mKeyFindFirst.mockRejectedValueOnce(new Error("db down"));
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(500);
        expect(mCreate).not.toHaveBeenCalled();
      });

      it("policy OFF still captures when the probe errors (telemetry never blocks)", async () => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
        mKeyFindFirst.mockRejectedValueOnce(new Error("db down"));
        const res = await POST(multipartRequest(unsignedForm()), params);
        expect(res.status).toBe(201);
      });
    });

    it("a FORGED signedManifestVerified claim inside structuredData is overwritten to false (policy OFF)", async () => {
      // Sanitiser behaviour on an ACCEPTED unsigned upload — exercised under an
      // explicit policy-OFF, since the default now rejects unsigned multipart.
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
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
