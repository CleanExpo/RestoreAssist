/**
 * RA-7709: the Review & Submit preview said Category 1 / Class 1, the saved
 * record said Class 2 and was stored twice, and on another job an untouched
 * submit was recorded as a "Technician manual classification override".
 *
 * These tests drive the real submit route against a stateful in-memory
 * Classification table, so a second row, a retry, or a stale
 * WaterDamageClassification row shows up as a count or a flag — not as a
 * mock call that "happened".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sqmToSqft } from "@/lib/units";
import { classifyIICRC } from "@/lib/nir-classification-engine";
import {
  calculateClassificationPreview,
  manualClassificationPayload,
  resumedManualClassification,
} from "@/lib/forms/classification-preview";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _req: unknown,
    _userId: unknown,
    fn: (rawBody?: string) => Promise<Response>,
  ) => fn(),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: vi.fn().mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: { id: "insp-1" } },
  }),
}));

vi.mock("@/lib/services/inspection/validate-submission", () => ({
  validateSubmissionPayload: vi.fn().mockReturnValue({ ok: true }),
}));
vi.mock("@/lib/nir-tiered-completion", () => ({
  validateTieredCompletion: vi.fn().mockReturnValue({
    canSubmit: true,
    missingCritical: [],
    missingSupplementary: [],
    warnings: [],
    summary: {},
  }),
}));
vi.mock("@/lib/compliance/make-safe-gate", () => ({
  checkMakeSafeGate: vi.fn().mockResolvedValue({ canSubmit: true, blockers: [] }),
}));
vi.mock("@/lib/compliance/seed-make-safe", () => ({
  ensureMakeSafeSeeded: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/compliance/scope-variation-gate", () => ({
  checkScopeVariationGate: vi
    .fn()
    .mockResolvedValue({ canSubmit: true, blockers: [] }),
}));
vi.mock("@/lib/compliance/nz-moisture-gate", () => ({
  checkNzMoistureGate: vi.fn().mockResolvedValue({ warnings: [] }),
}));
vi.mock("@/lib/compliance/safework-notification-gate", () => ({
  checkSafeworkGate: vi.fn().mockResolvedValue({ notifications: [] }),
}));
vi.mock("@/lib/compliance/nzbs-compliance-gate", () => ({
  checkNzbsGate: vi
    .fn()
    .mockResolvedValue({ canSubmit: true, blockers: [], requiredClauses: [] }),
}));
vi.mock("@/lib/compliance/moisture-trend-anomaly", () => ({
  detectMoistureTrendAnomalies: vi
    .fn()
    .mockResolvedValue({ hasAnomalies: false, anomalies: [] }),
}));
vi.mock("@/lib/compliance/duplicate-detector", () => ({
  detectDuplicateJob: vi.fn().mockResolvedValue({ hasDuplicates: false }),
}));
vi.mock("@/lib/lifecycle/subscribers/next-action", () => ({
  onNextAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/evidence/submission-gate", () => ({
  validateSubmission: vi.fn().mockResolvedValue({ completionPercentage: 80 }),
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({
  recordFirstReportSaved: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn().mockResolvedValue(null),
  checkBuildingCodeTriggers: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn().mockResolvedValue({ items: [], contingency: 0 }),
}));

// ── Stateful in-memory Classification table ─────────────────────────────────

type Row = {
  id: string;
  inspectionId: string;
  category: string;
  class: string;
  justification: string;
  standardReference: string;
  confidence: number | null;
  inputData: string | null;
  isFinal: boolean;
  reviewedBy: string | null;
  createdAt: Date;
};

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  seq: 0,
  inspection: null as Record<string, unknown> | null,
  wdc: null as Record<string, unknown> | null,
}));

function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "not" in (v as object)) {
      return row[k] !== (v as { not: unknown }).not;
    }
    return row[k] === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const classification = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.seq += 1;
      const row = {
        id: `class-${db.seq}`,
        confidence: null,
        inputData: null,
        isFinal: false,
        reviewedBy: null,
        ...data,
        createdAt: new Date(Date.UTC(2026, 8, 23, 0, 0, db.seq)),
      };
      if (row.reviewedBy === undefined) row.reviewedBy = null;
      db.rows.push(row);
      return { ...row };
    }),
    findFirst: vi.fn(async (args: { where?: Record<string, unknown> } = {}) => {
      const found = db.rows
        .filter((r) => matches(r, args.where))
        .sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        );
      return found[0] ? { ...found[0] } : null;
    }),
    findMany: vi.fn(async (args: { where?: Record<string, unknown> } = {}) =>
      db.rows.filter((r) => matches(r, args.where)).map((r) => ({ ...r })),
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = db.rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`no classification ${where.id}`);
        Object.assign(row, data);
        if (row.reviewedBy === undefined) row.reviewedBy = null;
        return { ...row };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const hit = db.rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = db.rows.length;
      db.rows = db.rows.filter((r) => !matches(r, where));
      return { count: before - db.rows.length };
    }),
  };

  const client: Record<string, unknown> = {
    inspection: {
      findUnique: vi.fn(async () =>
        db.inspection ? structuredClone(db.inspection) : null,
      ),
      findFirst: vi.fn(async () =>
        db.inspection
          ? { id: db.inspection.id, claimType: "WATER", photos: [] }
          : null,
      ),
      // CAS always wins: models a re-run of the pipeline (retry / re-submit).
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    liveTeacherSession: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    pilotObservation: { create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
    classification,
    // Stateful: the Claim-type evidence panel reads and writes this record.
    waterDamageClassification: {
      findUnique: vi.fn(async () => (db.wdc ? { ...db.wdc } : null)),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          db.wdc = db.wdc ? { ...db.wdc, ...update } : { ...create };
          return { ...db.wdc };
        },
      ),
      deleteMany: vi.fn(async () => {
        const count = db.wdc ? 1 : 0;
        db.wdc = null;
        return { count };
      }),
    },
    affectedArea: {
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    environmentalData: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
    },
    moistureReading: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    scopeItem: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    costEstimate: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  client.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(client)
      : Promise.all(arg as unknown[]),
  );
  return { prisma: client };
});

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

// ── Fixtures ────────────────────────────────────────────────────────────────

type CaseArea = {
  room: string;
  sqm: number;
  source: string;
  hours: number;
};
type CaseReading = { room: string; surface: string; level: number };

const environmentalData = {
  id: "env-1",
  ambientTemperature: 22,
  humidityLevel: 55,
  dewPoint: 12,
  airCirculation: false,
};

function inspectionFixture(
  areas: CaseArea[],
  readings: CaseReading[],
  wdc: { waterCategory: string; damageClass: string } | null = null,
) {
  return {
    id: "insp-1",
    status: "DRAFT",
    claimType: "WATER",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    inspectionDate: new Date(),
    reportId: null,
    environmentalData,
    moistureReadings: readings.map((r, i) => ({
      id: `mr-${i}`,
      location: r.room,
      surfaceType: r.surface,
      moistureLevel: r.level,
      depth: "Surface",
    })),
    // Dual-written the way draft-snapshot stores them (m² + derived sq ft).
    affectedAreas: areas.map((a, i) => ({
      id: `area-${i}`,
      roomZoneId: a.room,
      affectedAreaSqm: a.sqm,
      affectedSquareFootage: sqmToSqft(a.sqm),
      waterSource: a.source,
      timeSinceLoss: a.hours,
      category: null,
      class: null,
    })),
    scopeItems: [],
    _count: { photos: 0 },
    photos: [],
    waterDamageClassification: wdc,
  };
}

/** What the technician form holds for the same job (area in m²). */
function formInput(areas: CaseArea[], readings: CaseReading[]) {
  return {
    affectedAreas: areas.map((a) => ({
      roomZoneId: a.room,
      affectedSquareFootage: a.sqm,
      waterSource: a.source,
      timeSinceLoss: a.hours,
    })),
    moistureReadings: readings.map((r) => ({
      location: r.room,
      surfaceType: r.surface,
      moistureLevel: r.level,
      depth: "Surface",
    })),
    environmentalData,
  };
}

function submitRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp-1/submit", {
    method: "POST",
  });
}
const params = { params: Promise.resolve({ id: "insp-1" }) };

async function submit() {
  const { POST } = await import("../route");
  const res = await POST(submitRequest(), params);
  expect(res.status).toBe(200);
}

function rowsFor(inspectionId = "insp-1"): Row[] {
  return db.rows.filter((r) => r.inspectionId === inspectionId) as Row[];
}

/** The row every reader shows: `classifications` ordered by createdAt desc, [0]. */
function shownRow(): Row | undefined {
  return [...rowsFor()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [];
  db.seq = 0;
  db.inspection = null;
  db.wdc = null;
  mockGetServerSession.mockResolvedValue({
    user: { id: "user-1", email: "t@example.com" },
  } as never);
});

// ── 1. Preview and persist agree ────────────────────────────────────────────

const GOLDEN: Array<{
  name: string;
  areas: CaseArea[];
  readings: CaseReading[];
}> = [
  {
    name: "clean water, 5 m², dry carpet",
    areas: [{ room: "Hall", sqm: 5, source: "Clean Water", hours: 12 }],
    readings: [{ room: "Hall", surface: "Carpet", level: 10 }],
  },
  {
    name: "clean water, 22 m², dry carpet (the reported Cat 1 / Class 1 job shape)",
    areas: [{ room: "Living room", sqm: 22, source: "Clean Water", hours: 12 }],
    readings: [{ room: "Living room", surface: "Carpet", level: 10 }],
  },
  {
    name: "clean water, 10 m², plasterboard at 18%",
    areas: [{ room: "Bedroom", sqm: 10, source: "Clean Water", hours: 6 }],
    readings: [{ room: "Bedroom", surface: "Plasterboard", level: 18 }],
  },
  {
    name: "burst pipe, 5 m²",
    areas: [{ room: "Laundry", sqm: 5, source: "Burst pipe", hours: 4 }],
    readings: [{ room: "Laundry", surface: "Vinyl", level: 8 }],
  },
  {
    name: "source not recorded clearly",
    areas: [{ room: "Study", sqm: 5, source: "Unknown", hours: 4 }],
    readings: [{ room: "Study", surface: "Carpet", level: 8 }],
  },
  {
    name: "clean water left 60 hours",
    areas: [{ room: "Kitchen", sqm: 5, source: "Clean Water", hours: 60 }],
    readings: [{ room: "Kitchen", surface: "Vinyl", level: 8 }],
  },
  {
    name: "grey water, 5 m²",
    areas: [{ room: "Bathroom", sqm: 5, source: "Grey water", hours: 4 }],
    readings: [{ room: "Bathroom", surface: "Tile", level: 8 }],
  },
  {
    name: "dishwasher overflow",
    areas: [{ room: "Kitchen", sqm: 5, source: "Dishwasher overflow", hours: 4 }],
    readings: [{ room: "Kitchen", surface: "Vinyl", level: 8 }],
  },
  {
    name: "sewage, 120 m², wet carpet",
    areas: [{ room: "Basement", sqm: 120, source: "Sewage backup", hours: 4 }],
    readings: [{ room: "Basement", surface: "Carpet", level: 25 }],
  },
  {
    name: "concrete slab at 20%",
    areas: [{ room: "Garage", sqm: 5, source: "Clean Water", hours: 4 }],
    readings: [{ room: "Garage", surface: "Concrete", level: 20 }],
  },
  {
    name: "two rooms, second one grey water",
    areas: [
      { room: "Hall", sqm: 5, source: "Clean Water", hours: 4 },
      { room: "Laundry", sqm: 5, source: "Grey water", hours: 4 },
    ],
    readings: [
      { room: "Hall", surface: "Carpet", level: 8 },
      { room: "Laundry", surface: "Vinyl", level: 8 },
    ],
  },
  {
    name: "two clean rooms of 20 m²",
    areas: [
      { room: "Lounge", sqm: 20, source: "Clean Water", hours: 4 },
      { room: "Dining", sqm: 20, source: "Clean Water", hours: 4 },
    ],
    readings: [
      { room: "Lounge", surface: "Carpet", level: 8 },
      { room: "Dining", surface: "Carpet", level: 8 },
    ],
  },
];

describe("RA-7709 — Review & Submit preview equals the saved classification", () => {
  it.each(GOLDEN)("$name", async ({ areas, readings }) => {
    const preview = calculateClassificationPreview(formInput(areas, readings));
    expect(preview).not.toBeNull();

    db.inspection = inspectionFixture(areas, readings);
    await submit();

    const saved = shownRow();
    expect(saved).toBeDefined();
    expect({ category: preview!.category, class: preview!.class }).toEqual({
      category: saved!.category,
      class: saved!.class,
    });
  });
});

// ── 2. One row per inspection ───────────────────────────────────────────────

const TWO_ROOMS: CaseArea[] = [
  { room: "Hall", sqm: 22, source: "Clean Water", hours: 4 },
  { room: "Bedroom", sqm: 22, source: "Clean Water", hours: 4 },
];
const TWO_ROOM_READINGS: CaseReading[] = [
  { room: "Hall", surface: "Carpet", level: 10 },
  { room: "Bedroom", surface: "Carpet", level: 10 },
];

describe("RA-7709 — one classification row per inspection", () => {
  it("a submit with two affected rooms stores exactly one row", async () => {
    db.inspection = inspectionFixture(TWO_ROOMS, TWO_ROOM_READINGS);
    await submit();
    expect(rowsFor()).toHaveLength(1);
  });

  it("a retried submit still leaves exactly one row", async () => {
    db.inspection = inspectionFixture(TWO_ROOMS, TWO_ROOM_READINGS);
    await submit();
    await submit();
    expect(rowsFor()).toHaveLength(1);
  });

  it("recording a classification on the job page after submit keeps one row", async () => {
    db.inspection = inspectionFixture(TWO_ROOMS, TWO_ROOM_READINGS);
    await submit();

    const { POST } = await import("../../classification/route");
    const res = await POST(
      new NextRequest("http://localhost/api/inspections/insp-1/classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "2", class: "3" }),
      }),
      params,
    );
    expect(res.status).toBe(201);

    expect(rowsFor()).toHaveLength(1);
    expect(rowsFor()[0]).toMatchObject({ category: "2", class: "3" });
  });
});

// ── 3. Manual override only when the technician chose it ────────────────────

const OVERRIDE_TEXT = "Technician manual classification override";

describe("RA-7709 — manual override flag", () => {
  it("an untouched submit is not recorded as a manual override, even with a stale water-damage record", async () => {
    const areas: CaseArea[] = [
      { room: "Hall", sqm: 5, source: "Clean Water", hours: 4 },
    ];
    const readings: CaseReading[] = [{ room: "Hall", surface: "Carpet", level: 8 }];
    db.inspection = inspectionFixture(areas, readings, {
      waterCategory: "CAT_2",
      damageClass: "CLASS_2",
    });

    await submit();

    const expected = await classifyIICRC({
      waterSource: "Clean Water",
      affectedSquareFootage: sqmToSqft(5),
      moistureReadings: [{ surfaceType: "Carpet", moistureLevel: 8, depth: "Surface" }],
      environmentalData,
      timeSinceLoss: 4,
    });

    const saved = shownRow()!;
    expect(saved.justification).not.toContain(OVERRIDE_TEXT);
    expect(saved.reviewedBy).toBeNull();
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(false);
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: expected.category,
      class: expected.class,
    });
  });

  it("a classification the technician chose before submit is kept and flagged as theirs", async () => {
    const areas: CaseArea[] = [
      { room: "Hall", sqm: 5, source: "Clean Water", hours: 4 },
    ];
    const readings: CaseReading[] = [{ room: "Hall", surface: "Carpet", level: 8 }];
    db.inspection = inspectionFixture(areas, readings);
    // What the draft save records when the technician picks Cat 3 / Class 3.
    db.rows.push({
      id: "class-manual",
      inspectionId: "insp-1",
      category: "3",
      class: "3",
      justification: `${OVERRIDE_TEXT} recorded during inspection review.`,
      standardReference: "technician recorded",
      confidence: 100,
      inputData: null,
      isFinal: false,
      reviewedBy: "user-1",
      createdAt: new Date(Date.UTC(2026, 8, 22)),
    });

    await submit();

    expect(rowsFor()).toHaveLength(1);
    const saved = shownRow()!;
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: "3",
      class: "3",
    });
    expect(saved.reviewedBy).toBe("user-1");
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(true);
  });
});

// ── 4. The Claim-type evidence panel's Category / Class pick ────────────────
//
// Lead decision (RA-7709): a pick in NIRClaimAssessmentPanel is a real
// technician edit. It must reach the saved row and the preview, and clearing
// it must return the job to the calculated result.

async function panelPost(body: Record<string, unknown>) {
  const { POST } = await import("../../water-damage-classification/route");
  const res = await POST(
    new NextRequest(
      "http://localhost/api/inspections/insp-1/water-damage-classification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    params,
  );
  expect(res.status).toBe(200);
}

async function panelDelete() {
  const { DELETE } = await import("../../water-damage-classification/route");
  const res = await DELETE(
    new NextRequest(
      "http://localhost/api/inspections/insp-1/water-damage-classification",
      { method: "DELETE" },
    ),
    params,
  );
  expect(res.status).toBe(200);
}

const PANEL_AREAS: CaseArea[] = [
  { room: "Hall", sqm: 5, source: "Clean Water", hours: 4 },
];
const PANEL_READINGS: CaseReading[] = [
  { room: "Hall", surface: "Carpet", level: 8 },
];

describe("RA-7709 — Claim-type evidence panel choice", () => {
  it("a panel pick of Cat 2 / Class 3 is what the preview shows and what submit saves, as an override", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await panelPost({ waterCategory: "CAT_2", damageClass: "CLASS_3" });

    await submit();

    const saved = shownRow()!;
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: "2",
      class: "3",
    });
    expect(saved.reviewedBy).toBe("user-1");
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(true);
    expect(rowsFor()).toHaveLength(1);

    // The panel reports { category: "2", class: "3" } to the form (see the
    // panel component test); the preview is computed from that choice.
    const preview = calculateClassificationPreview({
      ...formInput(PANEL_AREAS, PANEL_READINGS),
      manualClassification: { category: "2", class: "3" },
    });
    expect({ category: preview!.category, class: preview!.class }).toEqual({
      category: saved.category,
      class: saved.class,
    });
  });

  it("clearing the panel pick before submit gives the calculated result, not an override", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await panelPost({ waterCategory: "CAT_2", damageClass: "CLASS_3" });
    await panelPost({ waterCategory: null, damageClass: null });

    await submit();

    const preview = calculateClassificationPreview({
      ...formInput(PANEL_AREAS, PANEL_READINGS),
      manualClassification: null,
    });
    const saved = shownRow()!;
    expect(saved.reviewedBy).toBeNull();
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(false);
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: preview!.category,
      class: preview!.class,
    });
    expect(rowsFor()).toHaveLength(1);
  });

  it("removing the panel record (claim type changed) before submit also clears the pick", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await panelPost({ waterCategory: "CAT_2", damageClass: "CLASS_3" });
    await panelDelete();

    await submit();

    const saved = shownRow()!;
    expect(saved.reviewedBy).toBeNull();
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(false);
  });

  it("saving only loss-source fields does not create a technician choice", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await panelPost({ lossSourceType: "PLUMBING", lossSourceIdentified: true });
    expect(rowsFor()).toHaveLength(0);
  });
});

// ── 5. Resuming a job keeps the technician's saved choice ───────────────────
//
// Cursor review of dd1b840f1 (P1-A / P1-B): the form never loaded an existing
// technician classification, and every draft save without a choice deleted
// it, so a job-page classification made on a DRAFT was wiped on submit.

async function draftSave(extra: Record<string, unknown>) {
  const { PUT } = await import("../../draft-snapshot/route");
  const res = await PUT(
    new NextRequest(
      "http://localhost/api/inspections/insp-1/draft-snapshot",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentalData: {
            ambientTemperature: 22,
            humidityLevel: 55,
            dewPoint: 12,
            airCirculation: false,
          },
          moistureReadings: [],
          affectedAreas: [],
          scopeItems: [],
          ...extra,
        }),
      },
    ),
    params,
  );
  expect(res.status).toBe(200);
}

async function jobPageClassification(category: string, cls: string) {
  const { POST } = await import("../../classification/route");
  const res = await POST(
    new NextRequest("http://localhost/api/inspections/insp-1/classification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, class: cls }),
    }),
    params,
  );
  expect(res.status).toBe(201);
}

describe("RA-7709 — resuming a job keeps the technician's choice", () => {
  it("(a) an existing Cat 2 / Class 3 choice is restored, previewed, kept through draft save and submit", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await jobPageClassification("2", "3");

    // The form resumes from GET /api/inspections?reportId=… which includes
    // the inspection's classifications.
    const resumed = resumedManualClassification({
      classifications: rowsFor(),
    });
    const preview = calculateClassificationPreview({
      ...formInput(PANEL_AREAS, PANEL_READINGS),
      manualClassification: resumed,
    });
    expect({ category: preview!.category, class: preview!.class }).toEqual({
      category: "2",
      class: "3",
    });

    // handleSubmit always draft-saves first.
    const payload = manualClassificationPayload(resumed, resumed !== null);
    await draftSave(payload === undefined ? {} : { manualClassification: payload });
    await submit();

    const saved = shownRow()!;
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: "2",
      class: "3",
    });
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(true);
    expect(saved.reviewedBy).toBe("user-1");
  });

  it("(b) a draft save with no choice field leaves a job-page classification alone", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await jobPageClassification("2", "3");

    await draftSave({});

    expect(rowsFor()).toHaveLength(1);
    expect(rowsFor()[0]).toMatchObject({
      category: "2",
      class: "3",
      reviewedBy: "user-1",
    });
  });

  it("(b) a form that never had a choice sends no choice field", () => {
    expect(manualClassificationPayload(null, false)).toBeUndefined();
    expect(
      manualClassificationPayload({ category: "2", class: "" }, false),
    ).toBeUndefined();
  });

  it("(c) an explicit clear deletes the choice and submit then auto-classifies", async () => {
    db.inspection = inspectionFixture(PANEL_AREAS, PANEL_READINGS);
    await jobPageClassification("2", "3");

    // The technician had the choice (restored) and pressed "Clear".
    const payload = manualClassificationPayload(null, true);
    expect(payload).toBeNull();
    await draftSave({ manualClassification: payload });
    expect(rowsFor()).toHaveLength(0);

    await submit();
    const preview = calculateClassificationPreview({
      ...formInput(PANEL_AREAS, PANEL_READINGS),
      manualClassification: null,
    });
    const saved = shownRow()!;
    expect(saved.reviewedBy).toBeNull();
    expect(JSON.parse(saved.inputData ?? "{}").manualOverride).toBe(false);
    expect({ category: saved.category, class: saved.class }).toEqual({
      category: preview!.category,
      class: preview!.class,
    });
  });

  it("an automatic row is not restored as a technician choice", () => {
    expect(
      resumedManualClassification({
        classifications: [
          { category: "2", class: "2", reviewedBy: null, createdAt: new Date() },
        ],
      }),
    ).toBeNull();
  });
});
