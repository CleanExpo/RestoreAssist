/**
 * RA-8388 D7 — the whole point.
 *
 * Daniella Baghdadi (DRC (NSW) Pty Ltd) could not finish insurance job
 * NIR-2026-11-B3F306. Every capture was refused with "This account has a
 * registered signing key - evidence must be submitted with a signed
 * manifest", and the job reported "7+ issues identified" that she could not
 * see or resolve.
 *
 * This test walks her job through the REAL routes and asserts the two gates
 * that produce that issue list come back empty:
 *
 *   - `validateSubmissionPayload` - the hard refusal (MISSING_AFFECTED_AREAS,
 *     MISSING_MOISTURE_READINGS, MISSING_PHOTOS);
 *   - `validateTieredCompletion` - the "N issues identified" list itself.
 *
 * Nothing here hand-builds a MoistureReading, an EnvironmentalData row, an
 * InspectionPhoto or an AffectedArea. Every one of them is produced by
 * POSTing to the route a technician's phone posts to, because a test that
 * inserts the rows itself proves the gate can pass - not that Guided Capture
 * can produce a job that passes it, which is the thing that was broken.
 *
 * SCOPE, stated rather than implied: this drives the capture routes and the
 * gate functions, NOT `POST /api/inspections/[id]/submit` end to end. That
 * handler runs classification, costing, five compliance gates, a Zoho push
 * and analytics AFTER the gate, none of which is what blocked her, and
 * mocking all of it would make this a test of the scaffolding. The route
 * returning 200 on a real database is proven by the browser run recorded
 * against this contract, not here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: async () => null,
}));

const INSPECTION_ID = "ins_b3f306";

vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionCapturable: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  assertInspectionTenancy: vi.fn(async () => ({
    ok: true,
    data: { id: INSPECTION_ID, userId: "u1", workspaceId: null },
  })),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: { inspectionManyWhere: { id: INSPECTION_ID } },
  })),
  // The real one opens a transaction, claims the parent row, then runs the
  // work. The claim always succeeds here; the point of the mock is that the
  // area is still created by the ROUTE's own code.
  writeWithinInspectionScope: vi.fn(
    async (
      _where: unknown,
      _data: unknown,
      work: (tx: unknown) => Promise<unknown>,
    ) => {
      const { prisma } = await import("@/lib/prisma");
      return (prisma as unknown as { $transaction: (f: unknown) => unknown })
        .$transaction(work);
    },
  ),
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: async () => ({
      originalUrl: "https://cdn.example.com/orig.jpg",
      compressedUrl: `https://cdn.example.com/${Math.random()}.jpg`,
      thumbnailUrl: "https://cdn.example.com/t.jpg",
      storagePath: "originals/a.jpg",
      compressedPath: "optimised/a.jpg",
      thumbnailPath: "optimised/a-thumb.jpg",
    }),
    delete: async () => undefined,
  }),
}));

/**
 * The inspection, as the database holds it. The capture routes write into
 * these arrays and the gates read out of them, so the only way a row gets
 * here is through a route.
 */
const store = {
  evidence: [] as Array<Record<string, unknown>>,
  moisture: [] as Array<Record<string, unknown>>,
  env: [] as Array<Record<string, unknown>>,
  photos: [] as Array<Record<string, unknown>>,
  areas: [] as Array<Record<string, unknown>>,
};
const idemStore = new Map<string, Record<string, unknown>>();
let nextId = 0;
const id = (p: string) => `${p}_${++nextId}`;

vi.mock("@/lib/prisma", () => {
  const push =
    (bucket: keyof typeof store, prefix: string) =>
    async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: id(prefix), ...data };
      store[bucket].push(row);
      return row;
    };
  const client = {
    evidenceItem: { create: vi.fn(push("evidence", "ev")) },
    moistureReading: { create: vi.fn(push("moisture", "mr")) },
    environmentalData: { create: vi.fn(push("env", "ed")) },
    inspectionPhoto: { create: vi.fn(push("photos", "ph")) },
    affectedArea: { create: vi.fn(push("areas", "aa")) },
    inspection: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => ({ id: INSPECTION_ID, userId: "u1" })),
      findUnique: vi.fn(async () => ({ id: INSPECTION_ID, userId: "u1" })),
    },
  };
  return {
    prisma: {
      ...client,
      user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      // The areas route writes an audit row after the create. Not what this
      // test is about, but it is on the real path so it has to exist.
      auditLog: { create: vi.fn(async () => ({ id: "al_1" })) },
      deviceSigningKey: {
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
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
      $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<unknown>) =>
        fn(client),
      ),
    },
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateDeviceKey } from "../device-signing";
import type { DeviceKeyRecord } from "../device-signing";
import { signManifest } from "../device-signing";
import { canonicalizeManifest } from "../manifest-canonical";
import { submitMetadataEvidence } from "../submit-metadata-evidence";
import {
  buildMetadataStructuredData,
  buildMetadataNotes,
  buildMetadataTitle,
} from "../metadata-fields";
import { POST as EVIDENCE_POST } from "@/app/api/inspections/[id]/evidence/route";
import { POST as AREA_POST } from "@/app/api/inspections/[id]/affected-areas/route";
import { validateSubmissionPayload } from "@/lib/services/inspection/validate-submission";
import { validateTieredCompletion } from "@/lib/nir-tiered-completion";
import { validateWorkflowEvidence } from "../submission-validator";
import { getWorkflowTemplate } from "../workflow-definitions";

/**
 * The blocking gaps the workflow validator reports for a COMPLETED Initial
 * Moisture Survey holding `captured` readings. The step is read from the
 * shipped water-damage template, so lowering its minimum changes this result.
 */
function moistureSurveyGaps(captured: number) {
  const step = getWorkflowTemplate("WATER_DAMAGE").steps.find(
    (s) => s.stepKey === "moisture_survey",
  );
  if (!step) throw new Error("moisture_survey is missing from WATER_DAMAGE");
  return validateWorkflowEvidence({
    id: "wf_1",
    jobType: "WATER_DAMAGE",
    experienceLevel: "EXPERIENCED",
    steps: [
      {
        id: "step_moisture",
        stepKey: step.stepKey,
        stepTitle: step.stepTitle,
        status: "COMPLETED",
        isMandatory: step.isMandatory,
        riskTier: step.riskTier,
        minimumEvidenceCount: step.minimumEvidenceCount,
        requiredEvidenceClasses: JSON.stringify(step.requiredEvidenceClasses),
        evidenceCount: captured,
      },
    ],
  }).blockingGaps;
}
import { createHash } from "node:crypto";

const params = { params: Promise.resolve({ id: INSPECTION_ID }) };

/**
 * IICRC S500:2021 section 10.2 - five readings is the floor for a water
 * damage job, and the locked contract forbids lowering it to make a gate
 * pass. Five DISTINCT locations, because one location read five times is
 * not a moisture survey.
 */
const FIVE_READINGS = [
  { location: "Living room south wall", surfaceType: "Plasterboard", moistureLevel: "18.4", depth: "Subsurface" },
  { location: "Living room skirting", surfaceType: "Timber", moistureLevel: "22.1", depth: "Surface" },
  { location: "Hallway east wall", surfaceType: "Plasterboard", moistureLevel: "16.8", depth: "Subsurface" },
  { location: "Hallway carpet underlay", surfaceType: "Carpet underlay", moistureLevel: "31.5", depth: "Surface" },
  { location: "Bedroom 1 west wall", surfaceType: "Plasterboard", moistureLevel: "14.2", depth: "Subsurface" },
];

/** Section 7.3 psychrometrics: an affected reading and a reference. */
const TWO_AMBIENTS = [
  { location: "Living room", ambientTemperature: "24.0", humidityLevel: "68" },
  { location: "External reference", ambientTemperature: "19.5", humidityLevel: "52" },
];

describe("a water-damage job captured in Guided Capture reaches zero blocking issues", () => {
  const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
  let deviceKey: DeviceKeyRecord;
  let capturedAtTick = 0;

  /** Capture one metadata reading through the REAL evidence route. */
  async function capture(
    evidenceClass: string,
    values: Record<string, string>,
  ) {
    const structuredData = buildMetadataStructuredData(evidenceClass, values);
    // A distinct capture time per reading, as a technician walking a
    // property produces. Identical times would collapse to one idempotency
    // key and silently under-count.
    capturedAtTick += 1;
    const capturedAt = new Date(
      Date.UTC(2026, 10, 15, 23, capturedAtTick, 0),
    ).toISOString();

    return submitMetadataEvidence(
      {
        inspectionId: INSPECTION_ID,
        workflowStepId: "step1",
        evidenceClass,
        title: buildMetadataTitle(evidenceClass, values),
        notes: buildMetadataNotes(evidenceClass, values),
        structuredData,
        capturedAt,
        deviceType: "WEB_BROWSER",
      },
      {
        userId: "u1",
        ensureKey: async () => deviceKey,
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
          EVIDENCE_POST(
            new NextRequest(
              new URL(String(input), "http://localhost").toString(),
              {
                method: "POST",
                headers: init?.headers as HeadersInit,
                body: init?.body as BodyInit,
              },
            ),
            params,
          )) as unknown as typeof fetch,
      },
    );
  }

  /** Upload one photograph through the REAL multipart branch. */
  async function capturePhoto(seed: number) {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed, 2, 3, 4]);
    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    const manifest = {
      inspectionId: INSPECTION_ID,
      workflowStepId: "step1",
      evidenceClass: "PHOTO_DAMAGE",
      capturedAt: new Date(Date.UTC(2026, 10, 15, 22, seed, 0)).toISOString(),
      gps: { lat: -33.87, lng: 151.1, accuracy: 5 },
      userId: "u1",
      deviceKeyId: deviceKey.keyId,
      sha256: fileSha256,
    };
    const signature = await signManifest(deviceKey.privateKey, manifest);
    const form = new FormData();
    form.set("file", new File([bytes], `d${seed}.jpg`, { type: "image/jpeg" }));
    form.set("evidenceClass", "PHOTO_DAMAGE");
    form.set("workflowStepId", "step1");
    form.set("sha256", fileSha256);
    form.set("signedManifest", canonicalizeManifest(manifest));
    form.set("manifestSignature", signature);
    form.set("structuredData", JSON.stringify({ description: "South wall" }));
    return EVIDENCE_POST(
      new NextRequest(
        `http://localhost/api/inspections/${INSPECTION_ID}/evidence`,
        { method: "POST", body: form, headers: { "Idempotency-Key": `photo-capture-${seed}` } },
      ),
      params,
    );
  }

  /** Create the affected area through the REAL dedicated route. */
  async function addArea() {
    return AREA_POST(
      new NextRequest(
        `http://localhost/api/inspections/${INSPECTION_ID}/affected-areas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "affected-area-001",
          },
          body: JSON.stringify({
            roomZoneId: "Living room",
            affectedAreaSqm: 24.5,
            waterSource: "Sewage backflow from floor waste",
            timeSinceLoss: 36,
            description: "Category 3 water across living room and hallway",
          }),
        },
      ),
      params,
    );
  }

  /**
   * The payload the submit route loads, assembled from the same columns its
   * own `findUnique` selects (app/api/inspections/[id]/submit/route.ts).
   * Mirrored deliberately and named as such: the alternative is mocking
   * twenty-five modules that run after the gate.
   */
  function payload() {
    return {
      id: INSPECTION_ID,
      status: "DRAFT",
      propertyAddress: "84 Newton Road, Strathfield NSW 2135",
      propertyPostcode: "2135",
      inspectionDate: new Date("2026-11-15T22:00:00.000Z"),
      claimType: "WATER",
      affectedAreas: store.areas.map((a) => ({
        id: a.id as string,
        roomZoneId: a.roomZoneId as string,
        affectedAreaSqm: a.affectedAreaSqm as number,
        affectedSquareFootage: a.affectedSquareFootage as number,
        waterSource: a.waterSource as string,
        timeSinceLoss: a.timeSinceLoss as number | null,
        category: 3,
        class: 2,
      })),
      moistureReadings: store.moisture.map((m) => ({
        id: m.id as string,
        location: m.location as string,
        sketchRoomId: null,
        isBaseline: false,
        sketchRoom: null,
        surfaceType: m.surfaceType as string,
        moistureLevel: m.moistureLevel as number,
        depth: m.depth as string,
      })),
      environmentalData: store.env.map((e) => ({
        id: e.id as string,
        ambientTemperature: e.ambientTemperature as number,
        humidityLevel: e.humidityLevel as number,
        dewPoint: null,
        airCirculation: null,
      })),
      photos: store.photos.map((p) => ({
        id: p.id as string,
        // Whatever the route actually wrote, not a stage this test made up.
        // Guided Capture records no stage today, which the tiered check
        // reports as a warning, never a blocking issue.
        photoStage: (p.photoStage as string | null | undefined) ?? null,
      })),
      scopeItems: [{ id: "si_1" }],
      // `waterSource` lives on AffectedArea, and validateTieredCompletion
      // takes it through its own field. The submit route maps it at
      // app/api/inspections/[id]/submit/route.ts:199-203; mirrored here,
      // because omitting it reports waterSource missing on a job that has
      // one - a false issue in the very list this test exists to empty.
      affectedAreasWithSource: store.areas.map((a) => ({
        waterSource: a.waterSource as string,
      })),
    };
  }

  beforeEach(async () => {
    store.evidence = [];
    store.moisture = [];
    store.env = [];
    store.photos = [];
    store.areas = [];
    idemStore.clear();
    capturedAtTick = 0;
    deviceKey = await generateDeviceKey();
    mSession.mockResolvedValue({ user: { id: "u1", name: "Daniella" } });
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

  async function captureTheWholeJob() {
    for (const r of FIVE_READINGS) {
      const res = await capture("MOISTURE_READING", r);
      // Every capture ACCEPTED. This is the refusal Daniella hit.
      expect(res.status).toBe(201);
    }
    for (const a of TWO_AMBIENTS) {
      const res = await capture("AMBIENT_ENVIRONMENTAL", a);
      expect(res.status).toBe(201);
    }
    const note = await capture("TECHNICIAN_NOTE", {
      note: "Sewage backflow through the floor waste. Occupants relocated.",
      location: "Whole property",
    });
    expect(note.status).toBe(201);

    const photo = await capturePhoto(1);
    expect(photo.status).toBe(201);

    const area = await addArea();
    expect(area.status).toBeLessThan(300);
  }

  it("captures every required item and the authoritative rows exist", async () => {
    await captureTheWholeJob();

    // The evidence list the technician sees.
    expect(store.evidence).toHaveLength(9);
    // The rows the completion gate actually counts - the half that was
    // never written, which is why the job would not close.
    expect(store.moisture).toHaveLength(5);
    expect(store.env).toHaveLength(2);
    expect(store.photos).toHaveLength(1);
    expect(store.areas).toHaveLength(1);
  });

  it("the submission gate returns no blocking refusal", async () => {
    await captureTheWholeJob();
    const result = validateSubmissionPayload(payload());
    expect(result.ok).toBe(true);
  });

  it("the tiered completion check identifies ZERO critical issues", async () => {
    // "7+ issues identified", which she could not see or resolve.
    await captureTheWholeJob();
    const tiered = validateTieredCompletion(payload() as never);
    expect(tiered.missingCritical.map((f) => f.fieldName)).toEqual([]);
  });

  // ─── Negative controls ───────────────────────────────────────────────────
  // Each one proves a specific gate is still live. Without these the three
  // tests above pass on a gate that cannot fail.

  it("FOUR readings is not a moisture survey", async () => {
    for (const r of FIVE_READINGS.slice(0, 4)) {
      expect((await capture("MOISTURE_READING", r)).status).toBe(201);
    }
    expect(store.moisture).toHaveLength(4);
    // The S500 floor is five, and it is enforced by the workflow validator
    // against the step definition - NOT by validateSubmissionPayload, which
    // asks only for one reading. So this drives the REAL validator with the
    // REAL step definition. (It used to assert `4 < 5`, which could not fail
    // and called no gate at all.)
    expect(moistureSurveyGaps(store.moisture.length)).toEqual([
      expect.objectContaining({
        stepKey: "moisture_survey",
        issue: "below_minimum",
        detail: "4/5 evidence items captured",
      }),
    ]);
  });

  it("FIVE readings satisfies the moisture survey", async () => {
    // The positive half of the control above: the same validator, the same
    // definition, one more reading.
    for (const r of FIVE_READINGS) {
      expect((await capture("MOISTURE_READING", r)).status).toBe(201);
    }
    expect(moistureSurveyGaps(store.moisture.length)).toEqual([]);
  });

  it("with no photograph the gate refuses the submission", async () => {
    for (const r of FIVE_READINGS) await capture("MOISTURE_READING", r);
    for (const a of TWO_AMBIENTS) await capture("AMBIENT_ENVIRONMENTAL", a);
    await addArea();
    // No capturePhoto. If the multipart branch stopped writing the
    // InspectionPhoto row, the happy-path test above would still pass and
    // this is what notices.
    expect(store.photos).toHaveLength(0);
    const result = validateSubmissionPayload(payload());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_PHOTOS");
  });

  it("with no affected area the gate refuses the submission", async () => {
    for (const r of FIVE_READINGS) await capture("MOISTURE_READING", r);
    await capturePhoto(1);
    // The dead end recorded in AMENDMENT 03 §R: Guided Capture never
    // creates an AffectedArea, and the job cannot close without one.
    expect(store.areas).toHaveLength(0);
    const result = validateSubmissionPayload(payload());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_AFFECTED_AREAS");
  });

  it("with no moisture reading at all the gate refuses the submission", async () => {
    await capturePhoto(1);
    await addArea();
    const result = validateSubmissionPayload(payload());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_MOISTURE_READINGS");
  });
});
