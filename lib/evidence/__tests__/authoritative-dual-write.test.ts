/**
 * RA-8388 Fault B: two stores, one writer.
 *
 * Guided Capture wrote an `EvidenceItem`. The completion gate counts
 * `MoistureReading`, `EnvironmentalData` and `InspectionPhoto`
 * (`validateSubmissionPayload`, and `validateTieredCompletion` beside it).
 * So a technician captured every item a step asked for, watched each one
 * appear in the evidence list, and was still told the job had outstanding
 * issues - with no way to see which, because the gate was counting rows
 * nothing had written.
 *
 * These tests pin the derivation, including the cases where it must REFUSE.
 * `MoistureReading.surfaceType` and `.depth` are required columns; a guessed
 * surface type inside an insurance record is worse than a refused capture,
 * so a submission that cannot produce a complete row is rejected with the
 * missing field named.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: async () => null,
}));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: async () => ({
      originalUrl: "https://cdn.example.com/orig.jpg",
      compressedUrl: "https://cdn.example.com/a.jpg",
      thumbnailUrl: "https://cdn.example.com/a-thumb.jpg",
      storagePath: "originals/a.jpg",
      compressedPath: "optimised/a.jpg",
      thumbnailPath: "optimised/a-thumb.jpg",
    }),
    delete: async () => undefined,
  }),
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

/**
 * A transaction mock that can actually ROLL BACK.
 *
 * Writes inside `$transaction` land in a staging buffer and are only merged
 * into `committed` when the callback returns. If the callback throws, the
 * buffer is discarded - which is the only way a test can tell a real
 * transaction from two sequential creates that happen to both succeed.
 */
const committed: {
  evidence: unknown[];
  moisture: unknown[];
  env: unknown[];
  photos: unknown[];
} = {
  evidence: [],
  moisture: [],
  env: [],
  photos: [],
};
let failAuthoritativeWrite = false;
let failPhotoWrite = false;
/**
 * Models the failure the retry contract exists for: Postgres COMMITS, then
 * the pooler connection drops before the client reads the result. The rows
 * are durable and the caller sees an exception, so the client cannot tell
 * this apart from a write that never happened.
 */
let commitThenThrow = false;
/** Off only to show what the database index prevents. */
let enforceSignedCaptureKey = true;
const idemStore = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/prisma", () => {
  const stage = () => ({ evidence: [] as unknown[], moisture: [] as unknown[], env: [] as unknown[], photos: [] as unknown[] });
  let pending = stage();
  /**
   * RA-8388 AMENDMENT 05: the unique index EvidenceItem_signed_capture_key,
   * modelled. A second row with the same inspection, class, digest and
   * signed capture time is refused the way Prisma reports it. A NULL digest
   * never collides, as in Postgres. The index ITSELF is proved on a real
   * database in authoritative-link.integration.test.ts; this model exists so
   * the route's handling of the refusal can be driven here.
   */
  const sameSignedCapture = (
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ) =>
    typeof a.metadataSha256 === "string" &&
    a.metadataSha256 === b.metadataSha256 &&
    a.inspectionId === b.inspectionId &&
    a.evidenceClass === b.evidenceClass &&
    (a.capturedAt as Date).getTime() === (b.capturedAt as Date).getTime();
  const txClient = {
    evidenceItem: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const clash = [...committed.evidence, ...pending.evidence].some(
          (row) => sameSignedCapture(row as Record<string, unknown>, data),
        );
        if (clash && enforceSignedCaptureKey) {
          const err = new Error("Unique constraint failed") as Error & {
            code?: string;
            meta?: unknown;
          };
          err.code = "P2002";
          err.meta = {
            modelName: "EvidenceItem",
            target: ["inspectionId", "evidenceClass", "metadataSha256", "capturedAt"],
          };
          throw err;
        }
        const row = {
          id: `ev_${committed.evidence.length + pending.evidence.length + 1}`,
          ...data,
        };
        pending.evidence.push(row);
        return row;
      }),
    },
    moistureReading: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failAuthoritativeWrite) {
          throw new Error("simulated database failure writing MoistureReading");
        }
        pending.moisture.push(data);
        return data;
      }),
    },
    environmentalData: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failAuthoritativeWrite) {
          throw new Error("simulated database failure writing EnvironmentalData");
        }
        pending.env.push(data);
        return data;
      }),
    },
    inspectionPhoto: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failPhotoWrite) {
          throw new Error("simulated database failure writing InspectionPhoto");
        }
        pending.photos.push(data);
        return data;
      }),
    },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      evidenceItem: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `ev_direct_${committed.evidence.length + 1}`, ...data };
          committed.evidence.push(row);
          return row;
        }),
        findFirst: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) =>
            committed.evidence.find((row) => {
              const r = row as Record<string, unknown>;
              return (
                r.inspectionId === where.inspectionId &&
                r.evidenceClass === where.evidenceClass &&
                r.metadataSha256 === where.metadataSha256 &&
                (r.capturedAt as Date).getTime() ===
                  (where.capturedAt as Date).getTime()
              );
            }) ?? null,
        ),
      },
      moistureReading: txClient.moistureReading,
      environmentalData: txClient.environmentalData,
      inspectionPhoto: txClient.inspectionPhoto,
      deviceSigningKey: {
        findUnique: vi.fn(async () => null),
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
          idemStore.set(key, { responseStatus: null, responseBody: null, ...data });
          return data;
        }),
        findUnique: vi.fn(
          async ({ where }: { where: { cacheKey: string } }) =>
            idemStore.get(where.cacheKey) ?? null,
        ),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 })),
        // Faithful, because the whole question is whether the reservation is
        // still held when the retry arrives. A deleteMany that always
        // reported "nothing deleted" made the release path invisible, so a
        // test could not tell a kept reservation from a released one.
        deleteMany: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            const key = where.cacheKey as string | undefined;
            if (!key || !idemStore.has(key)) return { count: 0 };
            if (
              where.status !== undefined &&
              idemStore.get(key)!.status !== where.status
            ) {
              return { count: 0 };
            }
            idemStore.delete(key);
            return { count: 1 };
          },
        ),
      },
      $transaction: vi.fn(
        async (fn: (tx: typeof txClient) => Promise<unknown>) => {
          pending = stage();
          try {
            const result = await fn(txClient);
            committed.evidence.push(...pending.evidence);
            committed.moisture.push(...pending.moisture);
            committed.env.push(...pending.env);
            committed.photos.push(...pending.photos);
            if (commitThenThrow) {
              throw new Error(
                "Server has closed the connection. (committed, result unread)",
              );
            }
            return result;
          } finally {
            pending = stage();
          }
        },
      ),
    },
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateDeviceKey } from "../device-signing";
import type { DeviceKeyRecord } from "../device-signing";
import { submitMetadataEvidence } from "../submit-metadata-evidence";
import {
  deriveAuthoritativeRow,
  photoRowPlan,
  shouldWritePhotoRow,
} from "../authoritative-rows";
import { signManifest } from "../device-signing";
import { canonicalizeManifest } from "../manifest-canonical";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/inspections/[id]/evidence/route";
import {
  buildMetadataStructuredData,
  buildMetadataNotes,
  buildMetadataTitle,
  validateMetadataValues,
  METADATA_FIELDS,
} from "../metadata-fields";

const CAPTURED_AT = new Date("2026-11-15T23:30:00.000Z");
const ctx = {
  inspectionId: "ins_1",
  capturedAt: CAPTURED_AT,
  notes: null as string | null,
};

describe("the form contract and the authoritative row agree", () => {
  // The structural guarantee. If a required column gained a field that the
  // form does not collect, this fails rather than a technician discovering it
  // on a wet site.
  it.each([
    ["MOISTURE_READING", ["location", "surfaceType", "moistureLevel", "depth"]],
    [
      "AMBIENT_ENVIRONMENTAL",
      ["location", "ambientTemperature", "humidityLevel"],
    ],
  ])("%s collects every field its row requires", (cls, required) => {
    const keys = METADATA_FIELDS[cls]
      .filter((f) => f.required)
      .map((f) => f.key);
    expect(keys.sort()).toEqual([...required].sort());
  });

  it("a complete moisture reading becomes a MoistureReading row", () => {
    const values = {
      location: "Living room south wall",
      surfaceType: "Plasterboard",
      moistureLevel: "18.4",
      depth: "Subsurface",
      notes: "Wicking above skirting",
    };
    expect(validateMetadataValues("MOISTURE_READING", values).ok).toBe(true);

    const structured = buildMetadataStructuredData("MOISTURE_READING", values);
    const result = deriveAuthoritativeRow("MOISTURE_READING", structured, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).not.toBeNull();
    expect(result.plan!.table).toBe("moistureReading");
    expect(result.plan!.data).toMatchObject({
      inspectionId: "ins_1",
      location: "Living room south wall",
      surfaceType: "Plasterboard",
      // A NUMBER, not the string the input produced - so the evidence record
      // and the counted row cannot disagree about whether 18.40 and 18.4 are
      // one reading.
      moistureLevel: 18.4,
      depth: "Subsurface",
      source: "manual",
      recordedAt: CAPTURED_AT,
    });

    // The row claims NO instrument scale. This assertion used to read
    // `unit: "PERCENT_MC"`, which pinned an invention: the capture form asks
    // for "Reading" in "%", and 18.4% moisture content and 18.4% WME are
    // different measurements under IICRC S500. Nobody asked the technician
    // which one the meter was set to, so the record must not answer.
    expect(
      (result.plan!.data as { unit?: string | null }).unit,
    ).toBeUndefined();
  });

  it("an ambient reading carries BOTH temperature and humidity", () => {
    // The client-reported defect in one line: the screen asked for a single
    // number labelled RH, while EnvironmentalData requires both columns.
    const values = {
      location: "Hallway",
      ambientTemperature: "22.1",
      humidityLevel: "61",
    };
    const structured = buildMetadataStructuredData(
      "AMBIENT_ENVIRONMENTAL",
      values,
    );
    const result = deriveAuthoritativeRow(
      "AMBIENT_ENVIRONMENTAL",
      structured,
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan!.table).toBe("environmentalData");
    expect(result.plan!.data).toMatchObject({
      ambientTemperature: 22.1,
      humidityLevel: 61,
      location: "Hallway",
    });
  });

  it.each([
    ["TECHNICIAN_NOTE", { note: "Sewage to skirting, category 3." }],
    [
      "EQUIPMENT_LOG",
      { equipment: "LGR dehumidifier", action: "Deployed", location: "Lounge" },
    ],
  ])("%s has no authoritative table, and says so explicitly", (cls, values) => {
    const structured = buildMetadataStructuredData(cls, values);
    const result = deriveAuthoritativeRow(cls, structured, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Distinct from a failure. A future class must not be dropped silently
    // because the deriver "returned nothing".
    expect(result.plan).toBeNull();
  });
});

describe("an incomplete reading is REFUSED, never written with a filler", () => {
  it("names the missing field when the surface type is absent", () => {
    const result = deriveAuthoritativeRow(
      "MOISTURE_READING",
      { location: "Hall", moistureLevel: 18.4, depth: "Surface" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["Material"]);
    expect(result.message).toContain("Material");
    expect(result.message).toContain("not saved");
  });

  it("names every missing field, not just the first", () => {
    const result = deriveAuthoritativeRow(
      "AMBIENT_ENVIRONMENTAL",
      { location: "Hall" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["Temperature", "Relative humidity"]);
  });

  it("refuses a non-finite number rather than storing NaN as a reading", () => {
    const result = deriveAuthoritativeRow(
      "MOISTURE_READING",
      {
        location: "Hall",
        surfaceType: "Timber",
        moistureLevel: Number.NaN,
        depth: "Surface",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("Reading");
  });

  it("refuses an empty payload outright", () => {
    const result = deriveAuthoritativeRow("MOISTURE_READING", null, ctx);
    expect(result.ok).toBe(false);
  });
});

describe("validation speaks per field, so nothing the technician typed is lost", () => {
  it("returns a message against each offending field", () => {
    const result = validateMetadataValues("MOISTURE_READING", {
      location: "",
      surfaceType: "Plasterboard",
      moistureLevel: "not a number",
      depth: "Subsurface",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.location).toContain("required");
    expect(result.errors.moistureLevel).toContain("number");
    // The fields that WERE valid carry no error, so the form can keep them.
    expect(result.errors.surfaceType).toBeUndefined();
    expect(result.errors.depth).toBeUndefined();
  });

  it("rejects a reading outside the physical range", () => {
    const result = validateMetadataValues("MOISTURE_READING", {
      location: "Hall",
      surfaceType: "Timber",
      moistureLevel: "140",
      depth: "Surface",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.moistureLevel).toContain("above");
  });

  it("rejects a value that is not one of the offered options", () => {
    const result = validateMetadataValues("MOISTURE_READING", {
      location: "Hall",
      surfaceType: "Unobtainium",
      moistureLevel: "18",
      depth: "Surface",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.surfaceType).toBeTruthy();
  });
});

describe("titles and notes read as a person would write them", () => {
  it("a moisture reading reads as location and material", () => {
    const values = {
      location: "Living room south wall",
      surfaceType: "Plasterboard",
      moistureLevel: "18.4",
      depth: "Subsurface",
    };
    expect(buildMetadataTitle("MOISTURE_READING", values)).toBe(
      "Living room south wall (Plasterboard)",
    );
    expect(buildMetadataNotes("MOISTURE_READING", values)).toBe(
      "Reading 18.4%, subsurface",
    );
  });

  it("a long technician note is summarised, not truncated mid-record", () => {
    const note = "A".repeat(200);
    const title = buildMetadataTitle("TECHNICIAN_NOTE", { note });
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title.endsWith("...")).toBe(true);
    // The full note survives in the body; only the title is shortened.
    expect(buildMetadataNotes("TECHNICIAN_NOTE", { note })).toBe(note);
  });
});

describe("the route writes both halves in ONE transaction", () => {
  const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

  // Submissions here go through the REAL signed client writer, because the
  // production policy is fail-closed: an unsigned submission is refused
  // whether or not a key is registered. Writing these tests against an
  // unsigned POST would have tested a 400 and called it a dual write.
  let deviceKey: DeviceKeyRecord;

  async function submit(
    structuredData: Record<string, unknown>,
    evidenceClass: string,
  ) {
    return submitMetadataEvidence(
      {
        inspectionId: "ins_1",
        workflowStepId: "step1",
        evidenceClass,
        title: buildMetadataTitle(evidenceClass, asValues(structuredData)),
        notes: buildMetadataNotes(evidenceClass, asValues(structuredData)),
        structuredData,
        capturedAt: "2026-11-15T23:30:00.000Z",
        deviceType: "WEB_BROWSER",
      },
      {
        userId: "u1",
        ensureKey: async () => deviceKey,
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : String(input);
          return POST(
            new NextRequest(new URL(url, "http://localhost").toString(), {
              method: "POST",
              headers: init?.headers as HeadersInit,
              body: init?.body as BodyInit,
            }),
            { params: Promise.resolve({ id: "ins_1" }) },
          );
        }) as unknown as typeof fetch,
      },
    );
  }

  function asValues(sd: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(sd)) {
      if (typeof v === "string" || typeof v === "number") out[k] = String(v);
    }
    return out;
  }

  const MOISTURE = {
    location: "Living room south wall",
    surfaceType: "Plasterboard",
    moistureLevel: 18.4,
    depth: "Subsurface",
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T00:00:00.000Z"));
    committed.evidence = [];
    committed.moisture = [];
    committed.env = [];
    idemStore.clear();
    failAuthoritativeWrite = false;
    commitThenThrow = false;
    enforceSignedCaptureKey = true;
    deviceKey = await generateDeviceKey();
    mSession.mockResolvedValue({ user: { id: "u1", name: "Tech" } });
    (
      prisma.deviceSigningKey.findUnique as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(async () => ({
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

  it("a moisture reading writes the evidence record AND the counted row", async () => {
    const result = await submit(MOISTURE, "MOISTURE_READING");
    expect(result.status).toBe(201);
    expect(committed.evidence).toHaveLength(1);
    // The row validateSubmissionPayload actually counts.
    expect(committed.moisture).toHaveLength(1);
    expect(committed.moisture[0]).toMatchObject({
      location: "Living room south wall",
      surfaceType: "Plasterboard",
      moistureLevel: 18.4,
    });
  });

  it("an ambient reading writes the EnvironmentalData row", async () => {
    const result = await submit(
      { location: "Hallway", ambientTemperature: 22.1, humidityLevel: 61 },
      "AMBIENT_ENVIRONMENTAL",
    );
    expect(result.status).toBe(201);
    expect(committed.env).toHaveLength(1);
    expect(committed.env[0]).toMatchObject({
      ambientTemperature: 22.1,
      humidityLevel: 61,
    });
  });

  it("when the authoritative write fails, the evidence record does NOT survive", async () => {
    // The whole reason this is a transaction. Without it the evidence list
    // would show a reading the completion gate can never count, and nobody
    // could tell why the job would not close.
    failAuthoritativeWrite = true;
    await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    expect(committed.moisture).toHaveLength(0);
    expect(committed.evidence).toHaveLength(0);
  });

  it("a lost response does not write the reading TWICE", async () => {
    // Daniella is in a basement on 4G. The reading commits; the response
    // never reaches her. She taps Save again - the product gave her no other
    // option.
    //
    // The content-derived idempotency key is identical on the retry, which
    // the spec took to be sufficient. It is not: `withIdempotency` DELETES
    // its PENDING reservation when the handler returns 5xx
    // (lib/idempotency.ts:433-441), so the same key reserves fresh and the
    // handler runs a second time. Neither MoistureReading nor
    // EnvironmentalData carries a unique constraint to catch it.
    //
    // Two signed records of one measurement, taken at two different times,
    // is worse than none: the dispute pack cites both.
    commitThenThrow = true;
    const first = await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    // The row IS durable - that is what makes this hard.
    expect(committed.moisture).toHaveLength(1);
    expect(committed.evidence).toHaveLength(1);
    // And the technician was NOT told it succeeded.
    expect(first?.status).not.toBe(201);

    // The retry: same draft, same capturedAt, so the same idempotency key.
    commitThenThrow = false;
    await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    expect(committed.moisture).toHaveLength(1);
    expect(committed.evidence).toHaveLength(1);
  });

  it("the counted moisture row carries the link to its evidence record", async () => {
    // AMENDMENT 05. Without the link nothing joins a counted reading to the
    // signed record behind it, so another writer cannot tell a signed row
    // from one it is free to rewrite.
    await submit(MOISTURE, "MOISTURE_READING");
    const evidence = committed.evidence[0] as { id: string };
    expect(evidence.id).toBeTruthy();
    expect(committed.moisture[0]).toMatchObject({ evidenceItemId: evidence.id });
  });

  it("the counted ambient row carries the link to its evidence record", async () => {
    await submit(
      { location: "Hallway", ambientTemperature: 22.1, humidityLevel: 61 },
      "AMBIENT_ENVIRONMENTAL",
    );
    const evidence = committed.evidence[0] as { id: string };
    expect(committed.env[0]).toMatchObject({ evidenceItemId: evidence.id });
  });

  it("a signed capture stores its digest and signed time, the two halves of the duplicate key", async () => {
    await submit(MOISTURE, "MOISTURE_READING");
    const evidence = committed.evidence[0] as {
      metadataSha256: unknown;
      capturedAt: Date;
    };
    expect(evidence.metadataSha256).toMatch(/^[0-9a-f]{64}$/);
    // The SIGNED capture time from the draft, not the server clock (which
    // these tests pin half an hour later).
    expect(evidence.capturedAt.toISOString()).toBe("2026-11-15T23:30:00.000Z");
  });

  it("a retry AFTER the idempotency lease has gone is answered as already recorded, not written twice", async () => {
    // The gap AMENDMENT 04 left open. The reading is stored, the response is
    // lost, and the technician tries again more than 60 seconds later - or
    // the reservation is released by anything else. The idempotency layer
    // has forgotten the first attempt, so the handler runs again in full.
    commitThenThrow = true;
    await submit(MOISTURE, "MOISTURE_READING").catch(() => null);
    expect(committed.evidence).toHaveLength(1);
    commitThenThrow = false;
    idemStore.clear();

    const retry = await submit(MOISTURE, "MOISTURE_READING");

    // Exactly one of each, still.
    expect(committed.evidence).toHaveLength(1);
    expect(committed.moisture).toHaveLength(1);
    // And the technician is told the truth: it is saved.
    expect(retry.status).toBe(200);
    expect(retry.ok).toBe(true);
    expect(retry.data).toMatchObject({
      alreadyRecorded: true,
      evidenceItem: { id: (committed.evidence[0] as { id: string }).id },
    });
  });

  it("logs the already-recorded answer with a fixed tag", async () => {
    // RA-8388 bench round 1: the duplicate answer was returned and never
    // logged, so a rising count of lost first responses was invisible.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      commitThenThrow = true;
      await submit(MOISTURE, "MOISTURE_READING").catch(() => null);
      commitThenThrow = false;
      idemStore.clear();

      const retry = await submit(MOISTURE, "MOISTURE_READING");
      expect(retry.status).toBe(200);

      const calls = warnSpy.mock.calls.filter(
        ([tag]) => tag === "[evidence] already-recorded",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({
        inspectionId: "ins_1",
        evidenceId: (committed.evidence[0] as { id: string }).id,
        evidenceClass: "MOISTURE_READING",
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gives the two-row write explicit wait and run limits", async () => {
    await submit(MOISTURE, "MOISTURE_READING");
    const calls = (prisma.$transaction as unknown as ReturnType<typeof vi.fn>)
      .mock.calls;
    expect(calls[calls.length - 1][1]).toEqual({
      maxWait: expect.any(Number),
      timeout: expect.any(Number),
    });
  });

  it("a transaction that never started is not reported as 'may already have been saved'", async () => {
    // No connection came free inside the wait limit, so Prisma gave up
    // BEFORE the transaction began (P2028, "Unable to start"). No statement
    // ran. Answering 409 "may already have been saved" would hold the
    // reservation for its lease and send the technician looking for a
    // reading that cannot exist.
    (
      prisma.$transaction as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(async () => {
      const err = new Error(
        "Transaction API error: Unable to start a transaction in the given time.",
      ) as Error & { code?: string };
      err.code = "P2028";
      throw err;
    });
    const first = await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    expect(committed.evidence).toHaveLength(0);
    expect(first?.status).not.toBe(409);
    expect(first?.mayHaveSaved).not.toBe(true);

    // The reservation was released, so the same draft goes straight through.
    const second = await submit(MOISTURE, "MOISTURE_READING");
    expect(second.status).toBe(201);
    expect(committed.moisture).toHaveLength(1);
  });

  it("a transaction that expired AFTER it started is still treated as possibly saved", async () => {
    // The negative control for the test above: every other P2028 keeps the
    // careful answer, because its inserts may have run.
    (
      prisma.$transaction as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(async () => {
      const err = new Error(
        "Transaction API error: A commit cannot be executed on an expired transaction.",
      ) as Error & { code?: string };
      err.code = "P2028";
      throw err;
    });
    const first = await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    expect(first?.status).toBe(409);
  });

  it("the same value captured at a different moment is a second reading, not a duplicate", async () => {
    // The digest does not contain the capture time. If the guard keyed on
    // the digest alone this second reading would be swallowed as "already
    // recorded" and the survey could never reach five.
    await submit(MOISTURE, "MOISTURE_READING");
    const later = await submitMetadataEvidence(
      {
        inspectionId: "ins_1",
        workflowStepId: "step1",
        evidenceClass: "MOISTURE_READING",
        title: buildMetadataTitle("MOISTURE_READING", asValues(MOISTURE)),
        notes: buildMetadataNotes("MOISTURE_READING", asValues(MOISTURE)),
        structuredData: MOISTURE,
        capturedAt: "2026-11-15T23:45:00.000Z",
        deviceType: "WEB_BROWSER",
      },
      {
        userId: "u1",
        ensureKey: async () => deviceKey,
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
          POST(
            new NextRequest(
              new URL(String(input), "http://localhost").toString(),
              {
                method: "POST",
                headers: init?.headers as HeadersInit,
                body: init?.body as BodyInit,
              },
            ),
            { params: Promise.resolve({ id: "ins_1" }) },
          )) as unknown as typeof fetch,
      },
    );
    expect(later.status).toBe(201);
    expect(committed.evidence).toHaveLength(2);
    expect(committed.moisture).toHaveLength(2);
  });

  it("a failure BEFORE the write is not reported as 'may already have been saved'", async () => {
    // The database drops while the gate is looking up the signing key.
    // Nothing has been inserted, so nothing can have committed. Answering
    // 409 "may already have been saved" here would hold the reservation,
    // remove Retry, and send the technician looking for a reading that does
    // not exist.
    (
      prisma.deviceSigningKey.findUnique as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(async () => {
      throw new Error("Server has closed the connection.");
    });
    const first = await submit(MOISTURE, "MOISTURE_READING").catch(() => null);

    expect(committed.evidence).toHaveLength(0);
    expect(committed.moisture).toHaveLength(0);
    expect(first?.status).not.toBe(409);
    expect(first?.mayHaveSaved).not.toBe(true);

    // And the same draft can be sent again straight away: the reservation
    // was released, so the retry is not answered "already in flight".
    const second = await submit(MOISTURE, "MOISTURE_READING");
    expect(second.status).toBe(201);
    expect(committed.moisture).toHaveLength(1);
  });

  it("a class with no authoritative table still writes its evidence record", async () => {
    const result = await submit(
      { equipment: "LGR dehumidifier", action: "Deployed", location: "Lounge" },
      "EQUIPMENT_LOG",
    );
    expect(result.status).toBe(201);
    expect(committed.evidence).toHaveLength(1);
    expect(committed.moisture).toHaveLength(0);
  });

  it("an incomplete reading is refused before anything is written", async () => {
    const result = await submit(
      { location: "Hall", moistureLevel: 18.4, depth: "Surface" },
      "MOISTURE_READING",
    );
    expect(result.status).toBe(400);
    expect(committed.evidence).toHaveLength(0);
    expect(committed.moisture).toHaveLength(0);
  });
});

describe("the photo half of the same fault", () => {
  it("plans an InspectionPhoto row from an uploaded capture", () => {
    // Photos "worked" from the technician's side - the upload succeeded and
    // an EvidenceItem appeared - while validateSubmissionPayload, which
    // counts InspectionPhoto, saw none of them.
    const plan = photoRowPlan({
      inspectionId: "ins_1",
      url: "https://cdn.example.com/a.jpg",
      thumbnailUrl: null,
      description: "South wall",
      location: "Living room",
      capturedAt: CAPTURED_AT,
      fileSize: 1024,
      mimeType: "image/jpeg",
      gpsLatitude: -33.87,
      gpsLongitude: 151.1,
    });
    expect(plan.table).toBe("inspectionPhoto");
    expect(plan.data).toMatchObject({
      inspectionId: "ins_1",
      url: "https://cdn.example.com/a.jpg",
      timestamp: CAPTURED_AT,
      gpsLatitude: -33.87,
    });
  });

  // `validateSubmissionPayload` counts InspectionPhoto rows to answer "does
  // this inspection have photographs of the damage". Every row written here
  // is an answer to that question, so a row written for something that is
  // not a photograph makes the completion gate pass on evidence that does
  // not exist. These are the negative controls: the cases that must NOT
  // write a row.
  it.each([
    // The real thing.
    ["PHOTO_DAMAGE", "image/jpeg", true],
    ["PHOTO_EQUIPMENT", "image/png", true],
    // Was "image/heic": the route refuses HEIC by its magic bytes, so that
    // is a value no stored record written by it can carry.
    ["PHOTO_PROGRESS", "image/gif", true],
    ["PHOTO_COMPLETION", "image/webp", true],
    // Photographs that do not carry the PHOTO_ prefix.
    ["THERMAL_IMAGE", "image/jpeg", true],
    ["AFFECTED_CONTENTS", "image/jpeg", true],
    // A video travels this same multipart branch. Counting it as a photo is
    // how `job-completes` would return 200 on an inspection with no
    // photographs at all.
    ["VIDEO_WALKTHROUGH", "video/mp4", false],
    // Documents. Each of these is routinely a SCANNED IMAGE, so a mime-only
    // test would count a scanned authority form as a photo of the damage.
    ["AUTHORITY_FORM", "image/jpeg", false],
    ["SCOPE_DOCUMENT", "image/png", false],
    ["FLOOR_PLAN", "image/png", false],
    ["LAB_RESULT", "application/pdf", false],
    ["COMPLIANCE_CERTIFICATE", "image/jpeg", false],
    ["THIRD_PARTY_REPORT", "image/jpeg", false],
    // A PDF uploaded under a photo class is not a photograph either, so the
    // class alone cannot be the test.
    ["PHOTO_DAMAGE", "application/pdf", false],
    // No mime type at all. The route never passes this any more: it stores
    // and decides from the type its magic-byte check proved. These rows are
    // the backfill's cases, over records another writer stored with no type
    // (a promoted portal upload, for one), where nothing vouches for the
    // bytes and a guess must not count.
    ["PHOTO_DAMAGE", "", false],
    ["PHOTO_DAMAGE", null, false],
  ] as Array<[string, string | null, boolean]>)(
    "%s + %s writes an InspectionPhoto row: %s",
    (evidenceClass, mimeType, expected) => {
      expect(shouldWritePhotoRow(evidenceClass, mimeType, false)).toBe(expected);
    },
  );

  it("a photograph promoted from the client portal never counts, whatever its type", () => {
    // Founder ruling 16/11/2026. The exclusion lives in the one shared
    // predicate, so the capture route and the backfill cannot disagree.
    expect(shouldWritePhotoRow("PHOTO_DAMAGE", "image/jpeg", false)).toBe(true);
    expect(shouldWritePhotoRow("PHOTO_DAMAGE", "image/jpeg", true)).toBe(false);
    expect(shouldWritePhotoRow("THERMAL_IMAGE", "image/png", true)).toBe(false);
  });
});

/**
 * The multipart half of the wiring.
 *
 * `photoRowPlan` was written, tested and had NO caller: the multipart branch
 * created an EvidenceItem and stopped. So a technician's photo appeared in
 * the evidence list, and `validateSubmissionPayload` - which counts
 * InspectionPhoto - still reported MISSING_PHOTOS on a job that visibly had
 * photographs in it.
 *
 * These drive the REAL route through a signed multipart upload, because the
 * signing policy is fail-closed: an unsigned upload is refused whether or not
 * the account holds a key, so an unsigned test here would assert a 400 and
 * call it a dual write.
 */
describe("the multipart branch writes the photo row in the SAME transaction", () => {
  const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
  let deviceKey: DeviceKeyRecord;

  const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  async function upload(evidenceClass: string, mimeType: string) {
    // The digest the SERVER will compute over the bytes it stores. The
    // manifest has to vouch for exactly these bytes or the gate refuses it.
    const fileSha256 = createHash("sha256").update(BYTES).digest("hex");

    const manifest = {
      inspectionId: "ins_1",
      workflowStepId: "step1",
      evidenceClass,
      capturedAt: "2026-11-15T23:30:00.000Z",
      gps: { lat: -33.87, lng: 151.1, accuracy: 5 },
      userId: "u1",
      deviceKeyId: deviceKey.keyId,
      sha256: fileSha256,
    };
    const signature = await signManifest(deviceKey.privateKey, manifest);

    const form = new FormData();
    form.set(
      "file",
      new File([BYTES], "damage.jpg", { type: mimeType }),
      "damage.jpg",
    );
    form.set("evidenceClass", evidenceClass);
    form.set("workflowStepId", "step1");
    form.set("sha256", fileSha256);
    form.set("capturedLat", "-33.87");
    form.set("capturedLng", "151.1");
    form.set("signedManifest", canonicalizeManifest(manifest));
    form.set("manifestSignature", signature);
    form.set(
      "structuredData",
      JSON.stringify({ description: "South wall", location: "Living room" }),
    );

    return POST(
      new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
        method: "POST",
        body: form,
        headers: { "Idempotency-Key": `idem-${evidenceClass}-${mimeType}` },
      }),
      { params: Promise.resolve({ id: "ins_1" }) },
    );
  }

  beforeEach(async () => {
    committed.evidence = [];
    committed.moisture = [];
    committed.env = [];
    committed.photos = [];
    idemStore.clear();
    failAuthoritativeWrite = false;
    failPhotoWrite = false;
    deviceKey = await generateDeviceKey();
    mSession.mockResolvedValue({ user: { id: "u1", name: "Tech" } });
    (
      prisma.deviceSigningKey.findUnique as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(async () => ({
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

  it("a photo writes the evidence record AND the row the gate counts", async () => {
    const res = await upload("PHOTO_DAMAGE", "image/jpeg");
    expect(res.status).toBe(201);
    expect(committed.evidence).toHaveLength(1);
    expect(committed.photos).toHaveLength(1);
    expect(committed.photos[0]).toMatchObject({
      inspectionId: "ins_1",
      url: "https://cdn.example.com/a.jpg",
      description: "South wall",
      location: "Living room",
      // The SIGNED capture time and position, not a server clock - the two
      // halves must not disagree about when and where the photo was taken.
      timestamp: new Date("2026-11-15T23:30:00.000Z"),
      gpsLatitude: -33.87,
      gpsLongitude: 151.1,
    });
  });

  it("when the photo row fails, the evidence record does NOT survive", async () => {
    // The rollback case. Without a transaction this leaves an EvidenceItem
    // the dispute pack can cite and the completion gate cannot count - the
    // exact split that made the original fault invisible.
    failPhotoWrite = true;
    const res = await upload("PHOTO_DAMAGE", "image/jpeg");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(committed.photos).toHaveLength(0);
    expect(committed.evidence).toHaveLength(0);
  });

  it("a scanned authority form writes NO photo row", async () => {
    // Same multipart branch, same image mime type, and it is not a
    // photograph of the damage. If this wrote a row, an inspection could
    // satisfy MISSING_PHOTOS with nothing but paperwork.
    const res = await upload("AUTHORITY_FORM", "image/jpeg");
    expect(res.status).toBe(201);
    expect(committed.evidence).toHaveLength(1);
    expect(committed.photos).toHaveLength(0);
  });
});
