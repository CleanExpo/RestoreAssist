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
const committed: { evidence: unknown[]; moisture: unknown[]; env: unknown[] } = {
  evidence: [],
  moisture: [],
  env: [],
};
let failAuthoritativeWrite = false;
const idemStore = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/prisma", () => {
  const stage = () => ({ evidence: [] as unknown[], moisture: [] as unknown[], env: [] as unknown[] });
  let pending = stage();
  const txClient = {
    evidenceItem: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ev_${pending.evidence.length + 1}`, ...data };
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
    inspectionPhoto: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
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
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      $transaction: vi.fn(
        async (fn: (tx: typeof txClient) => Promise<unknown>) => {
          pending = stage();
          try {
            const result = await fn(txClient);
            committed.evidence.push(...pending.evidence);
            committed.moisture.push(...pending.moisture);
            committed.env.push(...pending.env);
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
} from "../authoritative-rows";
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
      unit: "PERCENT_MC",
      source: "manual",
      recordedAt: CAPTURED_AT,
    });
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
});
