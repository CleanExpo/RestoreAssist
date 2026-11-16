/**
 * RA-8388: the CLIENT-TO-SERVER SEAM.
 *
 * Every other suite here builds its manifest and its request body by hand.
 * That is why the product shipped broken: the page built one shape, the test
 * built another, both were internally consistent, and the suite was green
 * while every reading a technician entered came back
 * "This account has a registered signing key - evidence must be submitted
 * with a signed manifest".
 *
 * This suite builds NOTHING by hand. It calls the real client writer
 * (`submitMetadataEvidence`) with a real Ed25519 device key from the real
 * `generateDeviceKey`, and routes its fetch straight into the real route
 * handler. If the page would send something the server refuses, this fails.
 *
 * It runs under the production default: EVIDENCE_REQUIRE_SIGNED_MANIFEST
 * unset, which means ON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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
let createdRows: Record<string, unknown>[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ev_${createdRows.length + 1}`, ...data };
        createdRows.push(row);
        return row;
      }),
    },
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
import { generateDeviceKey } from "@/lib/evidence/device-signing";
import type { DeviceKeyRecord } from "@/lib/evidence/device-signing";
import {
  submitMetadataEvidence,
  metadataDraftIdempotencyKey,
  type MetadataEvidenceDraft,
  type SignedRequestBytes,
} from "@/lib/evidence/submit-metadata-evidence";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mKeyFind = prisma.deviceSigningKey.findUnique as unknown as ReturnType<
  typeof vi.fn
>;

// The binding check bounds clock skew, so the clock is pinned exactly as the
// other signed suites pin it. Do not widen that window to "fix" an age-out.
const PINNED_NOW = new Date("2026-11-16T00:00:00.000Z");
const CAPTURED_AT = "2026-11-15T23:30:00.000Z";

let deviceKey: DeviceKeyRecord;

/**
 * Route the client's fetch into the real handler. This is the seam: whatever
 * `submitMetadataEvidence` puts on the wire is exactly what POST receives.
 */
function routeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return POST(
      new NextRequest(new URL(url, "http://localhost").toString(), {
        method: "POST",
        headers: init?.headers as HeadersInit,
        body: init?.body as BodyInit,
      }),
      { params: Promise.resolve({ id: "ins_1" }) },
    );
  }) as unknown as typeof fetch;
}

function deps(overrides: Partial<Parameters<typeof submitMetadataEvidence>[1]> = {}) {
  return {
    userId: "u1",
    ensureKey: async () => deviceKey,
    rotateKey: async () => {},
    signedCache: new Map<string, SignedRequestBytes>(),
    fetchImpl: routeFetch(),
    ...overrides,
  };
}

function draft(
  over: Partial<MetadataEvidenceDraft> = {},
): MetadataEvidenceDraft {
  return {
    inspectionId: "ins_1",
    workflowStepId: "step1",
    evidenceClass: "MOISTURE_READING",
    title: "Living room south wall (Plasterboard)",
    notes: "Reading 18.4%, subsurface",
    // The real field contract (lib/evidence/metadata-fields.ts). MoistureReading
    // requires a material and a depth, so a payload without them cannot
    // produce a row and is refused rather than stored half-formed.
    structuredData: {
      location: "Living room south wall",
      surfaceType: "Plasterboard",
      moistureLevel: 18.4,
      depth: "Subsurface",
      fieldContractVersion: 1,
    },
    capturedAt: CAPTURED_AT,
    deviceType: "WEB_BROWSER",
    ...over,
  };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
  idemStore.clear();
  createdRows = [];
  vi.clearAllMocks();
  deviceKey = await generateDeviceKey();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech" } });
  mKeyFind.mockImplementation(async () => ({
    id: "dk1",
    userId: "u1",
    publicKeyId: deviceKey.keyId,
    publicKeyPem: deviceKey.publicKeyPem,
    deviceUuid: null,
    devicePlatform: "web",
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    revokedAt: null,
    lastUsedAt: null,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("client-to-server seam: what the capture page actually sends", () => {
  it("a moisture reading entered on the page is accepted and stored verified", async () => {
    const result = await submitMetadataEvidence(draft(), deps());

    expect(result.status).toBe(201);
    expect(result.ok).toBe(true);
    expect(createdRows).toHaveLength(1);

    const persisted = JSON.parse(
      createdRows[0].structuredData as string,
    ) as Record<string, unknown>;
    expect(persisted.signedManifestVerified).toBe(true);
    // The server recomputed this from the fields it persisted; the client
    // never gets to assert a digest it did not earn.
    const manifest = persisted.c2paManifest as Record<string, unknown>;
    expect(typeof manifest.sha256).toBe("string");
    expect(manifest.digestKind).toBe("metadata");
    expect(manifest.payloadVersion).toBe(1);
  });

  it("EQUIPMENT_LOG, which carries neither notes nor structured data, is accepted", async () => {
    // The shape most likely to diverge between two normalisation
    // conventions: every optional field absent.
    const result = await submitMetadataEvidence(
      draft({
        evidenceClass: "EQUIPMENT_LOG",
        title: "Dehumidifier LGR-7000 deployed",
        notes: null,
        structuredData: null,
      }),
      deps(),
    );

    expect(result.status).toBe(201);
    const persisted = JSON.parse(
      createdRows[0].structuredData as string,
    ) as Record<string, unknown>;
    expect(persisted.signedManifestVerified).toBe(true);
  });

  it.each([
    ["TECHNICIAN_NOTE", "Triage notes", "Sewage visible to skirting; cat 3."],
  ])("%s is accepted", async (evidenceClass, title, notes) => {
    const result = await submitMetadataEvidence(
      draft({ evidenceClass, title, notes, structuredData: null }),
      deps(),
    );
    expect(result.status).toBe(201);
  });

  it("AMBIENT_ENVIRONMENTAL carries both temperature and humidity", async () => {
    // The client-reported defect: the screen asked for ONE number labelled
    // RH, while EnvironmentalData requires an ambient temperature too.
    const result = await submitMetadataEvidence(
      draft({
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        title: "Hallway",
        notes: "22.1C, 61% RH",
        structuredData: {
          location: "Hallway",
          ambientTemperature: 22.1,
          humidityLevel: 61,
          fieldContractVersion: 1,
        },
      }),
      deps(),
    );
    expect(result.status).toBe(201);
  });

  it("a retry of the SAME draft writes exactly one row", async () => {
    // The production failure this prevents: the response is lost, the
    // technician taps again, and one measurement lands in insurance evidence
    // twice with nothing to distinguish the duplicate from a real reading.
    const d = draft();
    const cache = new Map<string, SignedRequestBytes>();

    const first = await submitMetadataEvidence(d, deps({ signedCache: cache }));
    const second = await submitMetadataEvidence(d, deps({ signedCache: cache }));

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(createdRows).toHaveLength(1);
    expect(second.ok).toBe(true);
  });

  it("two genuinely different readings both persist", async () => {
    // The other direction, and the one that matters for Fault C: a step
    // needing five readings must be able to accumulate five.
    const a = draft();
    const b = draft({
      title: "Living room north wall (Plasterboard)",
      notes: "Reading 22.9%, subsurface",
      structuredData: {
        location: "Living room north wall",
        surfaceType: "Plasterboard",
        moistureLevel: 22.9,
        depth: "Subsurface",
        fieldContractVersion: 1,
      },
    });

    expect(await metadataDraftIdempotencyKey(a)).not.toBe(
      await metadataDraftIdempotencyKey(b),
    );

    await submitMetadataEvidence(a, deps());
    await submitMetadataEvidence(b, deps());
    expect(createdRows).toHaveLength(2);
  });

  it("two readings of the SAME value at different moments both persist", async () => {
    // Two walls can genuinely read 18.4. They are different measurements and
    // both belong in the record; only a retry of one draft is a duplicate.
    const first = draft({ capturedAt: "2026-11-15T23:30:00.000Z" });
    const second = draft({ capturedAt: "2026-11-15T23:34:00.000Z" });

    await submitMetadataEvidence(first, deps());
    await submitMetadataEvidence(second, deps());
    expect(createdRows).toHaveLength(2);
  });

  it("the idempotency key stays inside the server's 255-character bound", async () => {
    // Including the re-signed variant, which is why that attempt is scoped
    // through evidenceIdempotencyKey rather than by appending to the key.
    const plain = await metadataDraftIdempotencyKey(draft());
    const resigned = await metadataDraftIdempotencyKey(draft(), "resigned");
    expect(plain.length).toBeLessThanOrEqual(255);
    expect(resigned.length).toBeLessThanOrEqual(255);
    expect(resigned).not.toBe(plain);
  });

  it("an unregistered device key is refused, not quietly accepted", async () => {
    // The positive control for this whole suite: if the server stopped
    // checking, every test above would pass for the wrong reason.
    mKeyFind.mockResolvedValue(null);
    const result = await submitMetadataEvidence(draft(), deps());
    expect(result.ok).toBe(false);
    expect(createdRows).toHaveLength(0);
  });

  it("a tampered reading value is refused", async () => {
    // Sign one reading, send a different one. The server recomputes the
    // digest from what it is about to persist, so the swap cannot survive.
    const d = draft();
    const tampering: typeof fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      (body.structuredData as Record<string, unknown>).moistureLevel = 4.1;
      return routeFetch()(input, { ...init, body: JSON.stringify(body) });
    }) as unknown as typeof fetch;

    const result = await submitMetadataEvidence(
      d,
      deps({ fetchImpl: tampering }),
    );
    expect(result.ok).toBe(false);
    expect(createdRows).toHaveLength(0);
  });
});
