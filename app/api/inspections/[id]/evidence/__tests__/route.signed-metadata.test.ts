/**
 * RA-8388: signed metadata evidence on the JSON path.
 *
 * Before this suite, the four metadata-only evidence classes
 * (TECHNICIAN_NOTE, MOISTURE_READING, AMBIENT_ENVIRONMENTAL, EQUIPMENT_LOG)
 * had NO way to be signed. The client posted plain JSON, the fail-closed
 * policy refused it, and every reading, note and equipment log in the product
 * was rejected in production. The route's own comment called that an interim
 * "until a signed-metadata contract is added (client signs the canonical
 * JSON, server canonicalise-then-verifies)". This is that contract.
 *
 * The manifest shape is UNCHANGED. Its `sha256` carries a digest over the
 * canonical metadata payload instead of over file bytes, and the server
 * RECOMPUTES that digest from the fields it is about to persist, so a client
 * can never assert a digest it did not earn. `checkManifestBinding` already
 * accepts an arbitrary digest, so the security control itself is untouched.
 *
 * Every test here runs under the production default: policy ON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto, { createHash } from "crypto";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: async () => null,
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionCapturable: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  assertInspectionTenancy: vi.fn(async () => ({
    ok: true,
    data: { id: "ins_1", userId: "u1", workspaceId: null },
  })),
  assertInspectionAssignedWrite: vi.fn(),
}));

const idemStore = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: { create: vi.fn() },
    moistureReading: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    environmentalData: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    inspectionPhoto: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    // RA-8388: the route writes the evidence record and its authoritative
    // row in one transaction, so the mock must offer one.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma: client } = await import("@/lib/prisma");
      return fn(client);
    }),
    deviceSigningKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    clientMutation: {
      create: vi.fn(async () => ({ id: "cm_1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    idempotencyRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = data.cacheKey as string;
        if (idemStore.has(key)) {
          const err = new Error("Unique constraint failed") as Error & {
            code?: string;
          };
          err.code = "P2002";
          throw err;
        }
        idemStore.set(key, {
          responseStatus: null,
          responseBody: null,
          responseContentType: null,
          ...data,
        });
        return data;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { cacheKey: string } }) =>
          idemStore.get(where.cacheKey) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { cacheKey: string };
          data: Record<string, unknown>;
        }) => {
          const rec = idemStore.get(where.cacheKey) ?? {};
          Object.assign(rec, data);
          idemStore.set(where.cacheKey, rec);
          return rec;
        },
      ),
      // withIdempotencyFingerprint completes the record with updateMany, not
      // update (lib/idempotency.ts:469). Mocking only `update` left every
      // test failing on the harness rather than on the behaviour under test.
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { cacheKey: string };
          data: Record<string, unknown>;
        }) => {
          const rec = idemStore.get(where.cacheKey);
          if (!rec) return { count: 0 };
          Object.assign(rec, data);
          idemStore.set(where.cacheKey, rec);
          return { count: 1 };
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { canonicalizeManifest } from "@/lib/evidence/manifest-canonical";
import type { SignedEvidenceManifest } from "@/lib/evidence/manifest-canonical";
import { metadataPayloadSha256 } from "@/lib/evidence/metadata-payload";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mCreate = prisma.evidenceItem.create as unknown as ReturnType<
  typeof vi.fn
>;
const mKeyFind = prisma.deviceSigningKey.findUnique as unknown as ReturnType<
  typeof vi.fn
>;

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
  devicePlatform: "web",
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  revokedAt: null as Date | null,
  lastUsedAt: null as Date | null,
};

// Pin the clock, as the multipart signed suite does (RA-7436): the binding
// check bounds clock skew and backdating, so a floating fixture date would
// eventually age out and the API would correctly refuse. Do not widen the
// window to "fix" that.
const PINNED_NOW = new Date("2026-11-16T00:00:00.000Z");
const CAPTURED_AT = "2026-11-15T23:30:00.000Z";

/** The metadata a technician actually submits, as the server will persist it. */
type MetadataBody = {
  evidenceClass: string;
  title: string;
  notes?: string;
  structuredData?: Record<string, unknown> | null;
  workflowStepId?: string | null;
};

const MOISTURE_BODY: MetadataBody = {
  evidenceClass: "MOISTURE_READING",
  title: "Living room south wall (Plasterboard)",
  notes: "Reading 18.4%, subsurface",
  // RA-8388 Fault B: a moisture reading now also produces the
  // MoistureReading row the completion gate counts, and that table requires
  // a material and a depth. A payload without them cannot produce a row, so
  // it is refused rather than stored as evidence the gate will never see.
  structuredData: {
    location: "Living room south wall",
    surfaceType: "Plasterboard",
    moistureLevel: 18.4,
    depth: "Subsurface",
    fieldContractVersion: 1,
  },
  workflowStepId: "step1",
};

/**
 * The digest the CLIENT computes, through the same module the server uses.
 * Note `notes`, not `description`: the wire field name is what the client
 * holds, and renaming it is the shared module's job, not the caller's. Getting
 * that wrong here would have hidden the exact defect this contract exists to
 * prevent.
 */
async function digestFor(body: MetadataBody): Promise<string> {
  return metadataPayloadSha256({
    evidenceClass: body.evidenceClass,
    title: body.title,
    notes: body.notes ?? null,
    structuredData: body.structuredData ?? null,
  });
}

async function manifestFor(
  body: MetadataBody,
  overrides: Partial<SignedEvidenceManifest> = {},
): Promise<SignedEvidenceManifest> {
  return {
    inspectionId: "ins_1",
    workflowStepId: body.workflowStepId ?? null,
    evidenceClass: body.evidenceClass,
    capturedAt: CAPTURED_AT,
    gps: { lat: null, lng: null, accuracy: null },
    userId: "u1",
    deviceKeyId: KEY_ID,
    sha256: await digestFor(body),
    // Both are inside the signed bytes, and both must survive the persisted
    // whitelist — a manifest carrying a key outside it is refused outright
    // (structured-data.ts), so this also proves the lists were extended.
    payloadVersion: 1,
    digestKind: "metadata",
    ...overrides,
  };
}

/**
 * Canonicalise a manifest that has already been built. The parameter is typed
 * on purpose: `canonicalizeManifest` takes `unknown`, so handing it the
 * un-awaited promise from `manifestFor` compiled, canonicalised to `{}` and
 * made every negative control below pass for the wrong reason. Through this
 * helper a missing `await` is a type error.
 */
function canon(manifest: SignedEvidenceManifest): string {
  return canonicalizeManifest(manifest);
}

/**
 * A refusal counts only when it is the refusal the test set up. Status alone
 * cannot tell "the binding caught the swap" from "the manifest was malformed":
 * both are 400.
 */
async function expectRefused(res: Response, status: number, reason: RegExp) {
  expect(res.status).toBe(status);
  expect(JSON.stringify(await res.json())).toMatch(reason);
}

function signCanonical(json: string): string {
  return crypto
    .sign(null, Buffer.from(json, "utf8"), DEVICE_KEYS.privateKey)
    .toString("base64");
}

let idemCounter = 0;
function post(
  body: MetadataBody,
  signing: { manifestJson?: string; signature?: string | null } = {},
) {
  // The JSON writer uses the SAME field names as the multipart writer
  // (`signedManifest` / `manifestSignature`), deliberately: one vocabulary for
  // one contract, so there is nothing to translate between the two paths.
  const payload: Record<string, unknown> = { ...body };
  if (signing.manifestJson !== undefined) {
    payload.signedManifest = signing.manifestJson;
  }
  if (signing.signature !== undefined && signing.signature !== null) {
    payload.manifestSignature = signing.signature;
  }
  return POST(
    new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `signed-meta-${idemCounter++}`,
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id: "ins_1" }) },
  );
}

/**
 * The sanitiser persists `structuredData` as a JSON STRING, because every
 * writer stores it in a Prisma `String` column. Reading it as an object
 * silently yields undefined for every field, which looks like a product bug
 * and is a test bug, so parsing happens in exactly one place.
 */
function persistedStructuredData(): Record<string, unknown> {
  const data = mCreate.mock.calls[0][0].data as Record<string, unknown>;
  const raw = data.structuredData;
  if (typeof raw !== "string") {
    throw new Error(
      `expected structuredData to be persisted as a JSON string, got ${typeof raw}`,
    );
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Sign `body` honestly: the digest matches the payload being sent. */
async function signedPost(body: MetadataBody) {
  const manifestJson = canonicalizeManifest(await manifestFor(body));
  return post(body, { manifestJson, signature: signCanonical(manifestJson) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
  idemStore.clear();
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech" } });
  mKeyFind.mockResolvedValue(REGISTERED_KEY_ROW);
  mCreate.mockResolvedValue({ id: "ev_1" });
  // The production default. Set explicitly so the suite states its own
  // premise rather than relying on the fail-closed fallback.
  process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
});

describe("POST /evidence — signed metadata JSON (RA-8388, policy ON)", () => {
  it("accepts a correctly signed moisture reading and persists it as verified", async () => {
    const res = await signedPost(MOISTURE_BODY);
    expect(res.status).toBe(201);

    expect(mCreate).toHaveBeenCalledTimes(1);
    const data = mCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.title).toBe("Living room south wall (Plasterboard)");
    expect(data.description).toBe("Reading 18.4%, subsurface");
    // The record must claim verification only because the server verified it.
    const structured = persistedStructuredData();
    expect(structured.signedManifestVerified).toBe(true);
    expect(structured.downgradeReason ?? null).toBeNull();
    // The stored digest is the one the SERVER recomputed, and the manifest
    // says what it covers, so no reader has to guess.
    const manifest = structured.c2paManifest as Record<string, unknown>;
    expect(manifest.digestKind).toBe("metadata");
    expect(manifest.sha256).toBe(await digestFor(MOISTURE_BODY));
    // Provenance comes from the signed manifest, not the server clock.
    expect((data.capturedAt as Date).toISOString()).toBe(CAPTURED_AT);
  });

  it("persists the measurement the technician entered, not a client-asserted digest", async () => {
    await signedPost(MOISTURE_BODY);
    const structured = persistedStructuredData();
    // The field-contract keys, stored as the technician entered them. A
    // number stays a number so the evidence record and the counted
    // MoistureReading row cannot disagree about one measurement.
    expect(structured.moistureLevel).toBe(18.4);
    expect(structured.surfaceType).toBe("Plasterboard");
    expect(structured.depth).toBe("Subsurface");
  });

  // The whole point of the fix: all four classes must be able to sign. A class
  // that is left off this list rejoins the unsigned path by omission, which is
  // exactly how three earlier review rounds found bypassed writers here.
  const METADATA_CLASSES: Array<[string, MetadataBody]> = [
    [
      "TECHNICIAN_NOTE",
      {
        evidenceClass: "TECHNICIAN_NOTE",
        title: "Initial attendance",
        notes: "Category 3 sewage, occupants relocated.",
        structuredData: null,
        workflowStepId: "step1",
      },
    ],
    ["MOISTURE_READING", MOISTURE_BODY],
    [
      "AMBIENT_ENVIRONMENTAL",
      {
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        title: "Living room ambient",
        notes: "Temperature 22.5 C, relative humidity 61 %",
        // The field-contract keys, which are what EnvironmentalData's
        // required columns are derived from. The screen that asked for one
        // number labelled RH could never have filled this.
        structuredData: {
          location: "Living room",
          ambientTemperature: 22.5,
          humidityLevel: 61,
          fieldContractVersion: 1,
        },
        workflowStepId: "step1",
      },
    ],
    [
      "EQUIPMENT_LOG",
      {
        evidenceClass: "EQUIPMENT_LOG",
        title: "Dehumidifier deployment",
        notes: "2 x LGR dehumidifier, 3 x air mover, installed 14:20.",
        structuredData: null,
        workflowStepId: "step1",
      },
    ],
  ];

  it.each(METADATA_CLASSES)(
    "accepts a signed %s submission",
    async (_label, body) => {
      const res = await signedPost(body);
      expect(res.status).toBe(201);
    },
  );

  describe("negative controls — the policy must still bite", () => {
    it("refuses a submission with no manifest at all", async () => {
      const res = await post(MOISTURE_BODY);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(JSON.stringify(json)).toMatch(/signed manifest/i);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a manifest sent without its signature", async () => {
      const manifestJson = canon(await manifestFor(MOISTURE_BODY));
      const res = await post(MOISTURE_BODY, { manifestJson });
      await expectRefused(res, 400, /manifestSignature is required/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a signature sent without its manifest", async () => {
      const signature = signCanonical(canon(await manifestFor(MOISTURE_BODY)));
      const res = await post(MOISTURE_BODY, { signature });
      await expectRefused(res, 400, /signedManifest is required/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a manifest whose digest does not match the submitted payload", async () => {
      // Sign an honest manifest for the real reading, then swap the value.
      // The signature still verifies; the BINDING must catch the swap.
      const manifestJson = canon(await manifestFor(MOISTURE_BODY));
      const signature = signCanonical(manifestJson);
      const tampered: MetadataBody = {
        ...MOISTURE_BODY,
        structuredData: { measurementValue: 2.0, measurementUnit: "%" },
      };
      const res = await post(tampered, { manifestJson, signature });
      await expectRefused(
        res,
        400,
        /does not match the signature it was sent with/,
      );
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a manifest altered after signing", async () => {
      const signature = signCanonical(canon(await manifestFor(MOISTURE_BODY)));
      const altered = canon(
        await manifestFor(MOISTURE_BODY, {
          inspectionId: "ins_1",
          userId: "u2",
        }),
      );
      const res = await post(MOISTURE_BODY, {
        manifestJson: altered,
        signature,
      });
      await expectRefused(res, 400, /signature verification failed/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a manifest bound to a different workflow step", async () => {
      const body = { ...MOISTURE_BODY };
      const manifestJson = canon(
        await manifestFor(body, { workflowStepId: "step-other" }),
      );
      const res = await post(body, {
        manifestJson,
        signature: signCanonical(manifestJson),
      });
      await expectRefused(res, 400, /bound to a different workflow step/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a manifest bound to a different evidence class", async () => {
      const manifestJson = canon(
        await manifestFor(MOISTURE_BODY, { evidenceClass: "TECHNICIAN_NOTE" }),
      );
      const res = await post(MOISTURE_BODY, {
        manifestJson,
        signature: signCanonical(manifestJson),
      });
      await expectRefused(res, 400, /bound to a different evidence class/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses another user's signing key with 403", async () => {
      mKeyFind.mockResolvedValue({ ...REGISTERED_KEY_ROW, userId: "someone" });
      const res = await signedPost(MOISTURE_BODY);
      expect(res.status).toBe(403);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses an unregistered signing key with 403", async () => {
      mKeyFind.mockResolvedValue(null);
      const res = await signedPost(MOISTURE_BODY);
      expect(res.status).toBe(403);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a revoked signing key with 403", async () => {
      mKeyFind.mockResolvedValue({
        ...REGISTERED_KEY_ROW,
        revokedAt: new Date("2026-11-10T00:00:00.000Z"),
      });
      const res = await signedPost(MOISTURE_BODY);
      expect(res.status).toBe(403);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a signature made by a key that is not the registered one", async () => {
      const other = crypto.generateKeyPairSync("ed25519");
      const manifestJson = canon(await manifestFor(MOISTURE_BODY));
      const foreign = crypto
        .sign(null, Buffer.from(manifestJson, "utf8"), other.privateKey)
        .toString("base64");
      const res = await post(MOISTURE_BODY, {
        manifestJson,
        signature: foreign,
      });
      await expectRefused(res, 400, /signature verification failed/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses a measurement that is not a finite number with 400, not a server error", async () => {
      // `1e999` is valid JSON and parses to Infinity, which the canonical
      // payload cannot hold. That is the sender's mistake, so it is a 400
      // with a sentence, not an unexplained 500.
      const raw = JSON.stringify(MOISTURE_BODY).replace(
        '"moistureLevel":18.4',
        '"moistureLevel":1e999',
      );
      expect(raw).toContain("1e999");
      const res = await POST(
        new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `signed-meta-${idemCounter++}`,
          },
          body: raw,
        }),
        { params: Promise.resolve({ id: "ins_1" }) },
      );
      await expectRefused(res, 400, /finite number/);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("cannot be talked into a verified stamp by the request body", async () => {
      // A caller asserting its own verification must not be believed.
      const body: MetadataBody = {
        ...MOISTURE_BODY,
        structuredData: {
          measurementValue: 18.4,
          measurementUnit: "%",
          signedManifestVerified: true,
          signedManifestSignature: "forged",
        },
      };
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(mCreate).not.toHaveBeenCalled();
    });
  });
});
