/**
 * RA-7610: a reading created against a SketchRoom reference must join to the
 * matching affected area even when its free-text location does not contain
 * the room name. On main the join is location-only, so "North Wall" misses
 * "Living room" and carpet removal never enters the scope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sqmToSqft } from "@/lib/units";

// Fire walkthrough gate: not under test here (see lib/voice/fire-smoke/__tests__/gate.test.ts).
vi.mock("@/lib/voice/fire-smoke/server", () => ({
  checkFireSubmitGate: async () => ({ blocked: false }),
  claimSubmitWithFireGate: (db: unknown, _inspection: unknown, claim: (tx: unknown) => unknown) =>
    claim(db),
}));
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
  assertInspectionAssignedWrite: vi.fn().mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: { id: "insp-1" }, viaAssignment: false },
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
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn().mockResolvedValue(null),
  checkBuildingCodeTriggers: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn().mockResolvedValue({ items: [], contingency: 0 }),
  resolveInspectionRates: vi.fn().mockResolvedValue({ ok: true, rates: null }),
}));

const mockInspectionFindUnique = vi.fn();
const mockInspectionUpdateMany = vi.fn();
const mockInspectionUpdate = vi.fn().mockResolvedValue({});
const mockLiveTeacherFindFirst = vi.fn().mockResolvedValue(null);
const mockLiveTeacherUpdate = vi.fn();
const mockPilotCreate = vi.fn().mockResolvedValue({});
const mockAuditCreate = vi.fn().mockResolvedValue({});
const mockClassificationCreate = vi.fn();
const mockAffectedAreaUpdate = vi.fn().mockResolvedValue({});
const mockScopeItemCreateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockCostEstimateCreateMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...a: unknown[]) => mockInspectionFindUnique(...a),
      updateMany: (...a: unknown[]) => mockInspectionUpdateMany(...a),
      update: (...a: unknown[]) => mockInspectionUpdate(...a),
    },
    liveTeacherSession: {
      findFirst: (...a: unknown[]) => mockLiveTeacherFindFirst(...a),
      update: (...a: unknown[]) => mockLiveTeacherUpdate(...a),
    },
    pilotObservation: { create: (...a: unknown[]) => mockPilotCreate(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
    classification: {
      findFirst: async () => null,
      create: (...a: unknown[]) => mockClassificationCreate(...a),
    },
    // RA-7709: the classification row is written inside a transaction.
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        classification: {
          findFirst: async () => null,
          create: (...a: unknown[]) => mockClassificationCreate(...a),
        },
      }),
    affectedArea: {
      update: (...a: unknown[]) => mockAffectedAreaUpdate(...a),
    },
    scopeItem: { createMany: (...a: unknown[]) => mockScopeItemCreateMany(...a) },
    costEstimate: {
      createMany: (...a: unknown[]) => mockCostEstimateCreateMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

const AREA_SQM = 22;
const AREA_SQFT = sqmToSqft(AREA_SQM);

const linkedReading = {
  id: "mr-1",
  location: "North Wall",
  sketchRoomId: "sr-living",
  sketchRoom: { id: "sr-living", name: "Living room" },
  surfaceType: "carpet",
  moistureLevel: 28,
  depth: "Surface",
};

const livingRoomArea = {
  id: "area-1",
  roomZoneId: "Living room",
  affectedAreaSqm: AREA_SQM,
  affectedSquareFootage: AREA_SQFT,
  waterSource: "Grey water",
  timeSinceLoss: 24,
  category: null,
  class: null,
};

const environmentalData = {
  id: "env-1",
  ambientTemperature: 22,
  humidityLevel: 55,
  dewPoint: 12,
  airCirculation: false,
};

function makeSubmitRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp-1/submit", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "insp-1" }) };

type CreatedScopeItem = {
  itemType: string;
  quantity: number | null;
  unit: string | null;
};

function createdScopeItems(): CreatedScopeItem[] {
  const call = mockScopeItemCreateMany.mock.calls[0];
  if (!call) return [];
  return (call[0] as { data: CreatedScopeItem[] }).data;
}

describe("submit route — RA-7610 SketchRoom join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "t@example.com" },
    } as never);
    mockInspectionFindUnique.mockResolvedValue({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [linkedReading],
      affectedAreas: [livingRoomArea],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mockInspectionUpdate.mockResolvedValue({});
    mockPilotCreate.mockResolvedValue({});
    mockAuditCreate.mockResolvedValue({});
    mockClassificationCreate.mockImplementation(
      async ({ data }: { data: unknown }) => ({
        id: "class-1",
        ...(data as object),
      }),
    );
    mockAffectedAreaUpdate.mockResolvedValue({});
    mockScopeItemCreateMany.mockResolvedValue({ count: 0 });
    mockCostEstimateCreateMany.mockResolvedValue({ count: 0 });
    mockLiveTeacherFindFirst.mockResolvedValue(null);
  });

  it("joins a SketchRoom-linked North Wall reading to the Living room area", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);

    const items = createdScopeItems();
    const carpetRemoval = items.find((item) => item.itemType === "remove_carpet");
    expect(carpetRemoval).toBeDefined();
    expect(carpetRemoval?.unit).toBe("m²");

    const findArgs = mockInspectionFindUnique.mock.calls[0]?.[0] as {
      include: {
        moistureReadings: {
          select: { sketchRoomId?: boolean; sketchRoom?: unknown };
        };
      };
    };
    expect(findArgs.include.moistureReadings.select.sketchRoomId).toBe(true);
  });

  // RA-8388: a signed reading cannot be edited, so a mistyped one is retired
  // (invalidatedAt). Submit read every row, so the retired value still drove
  // classification and the building-code check. The PDF route already leaves
  // retired readings out; submit must use the same rule.
  it("leaves retired moisture readings out of everything submit reads", async () => {
    const { POST } = await import("../route");
    await POST(makeSubmitRequest(), params);

    const findArgs = mockInspectionFindUnique.mock.calls[0]?.[0] as {
      include: { moistureReadings: { where?: unknown } };
    };
    expect(findArgs.include.moistureReadings.where).toEqual({
      invalidatedAt: null,
    });
  });

  // RA-8388 (founder ruling 17/11/2026): a photograph whose only evidence
  // record is REJECTED must not count at submit. The photo row has no link to
  // its evidence record, so the two are matched on the file URL, the same key
  // the delete path uses. A file a live record still cites keeps counting.
  it("leaves out a photograph whose only evidence record is rejected", async () => {
    const photos = [
      { id: "p-live", photoStage: "BEFORE", url: "https://files/live.jpg" },
      { id: "p-rejected", photoStage: "BEFORE", url: "https://files/rejected.jpg" },
      { id: "p-shared", photoStage: "BEFORE", url: "https://files/shared.jpg" },
      { id: "p-legacy", photoStage: "BEFORE", url: "https://files/no-evidence.jpg" },
    ];
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [linkedReading],
      affectedAreas: [livingRoomArea],
      scopeItems: [],
      photos,
      evidenceItems: [
        { fileUrl: "https://files/live.jpg", status: "ACTIVE" },
        { fileUrl: "https://files/rejected.jpg", status: "REJECTED" },
        { fileUrl: "https://files/shared.jpg", status: "REJECTED" },
        { fileUrl: "https://files/shared.jpg", status: "FLAGGED" },
      ],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    await POST(makeSubmitRequest(), params);

    const findArgs = mockInspectionFindUnique.mock.calls[0]?.[0] as {
      include: {
        photos: { select: { url?: boolean } };
        evidenceItems?: { where: unknown; select: unknown };
      };
    };
    expect(findArgs.include.photos.select.url).toBe(true);
    expect(findArgs.include.evidenceItems).toEqual({
      where: { fileUrl: { not: null } },
      select: { fileUrl: true, status: true },
    });

    const counted = ["p-live", "p-shared", "p-legacy"];
    const { validateSubmissionPayload } = await import(
      "@/lib/services/inspection/validate-submission"
    );
    const payload = vi.mocked(validateSubmissionPayload).mock.calls[0]?.[0] as {
      photos: { id: string }[];
    };
    expect(payload.photos.map((p) => p.id)).toEqual(counted);
    const { validateTieredCompletion } = await import(
      "@/lib/nir-tiered-completion"
    );
    const tiered = vi.mocked(validateTieredCompletion).mock.calls[0]?.[0] as {
      photos: { id: string }[];
    };
    expect(tiered.photos.map((p) => p.id)).toEqual(counted);
  });

  it.each([
    ["Bedroom", ["Bedroom 3", "Bedroom 4"]],
    ["Bedroom", ["Bedroom", "Bedroom"]],
    ["Rear Lounge", ["Living Room — Rear Lounge"]],
    ["Bedroom 3", ["Bedroom"]],
  ])("blocks a linked %s without one unique area before classification", async (roomName, labels) => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [{
        ...linkedReading,
        sketchRoomId: "sr-bedroom",
        sketchRoom: { id: "sr-bedroom", name: roomName },
      }],
      affectedAreas: labels.map((label, index) => ({
        ...livingRoomArea,
        id: `area-${index}`,
        roomZoneId: label,
      })),
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("accepts an exact numbered drawing-room name", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [{
        ...linkedReading,
        sketchRoomId: "sr-bedroom-4",
        sketchRoom: { id: "sr-bedroom-4", name: "Bedroom 4" },
      }],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Bedroom 4" }],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(createdScopeItems().some((item) => item.itemType === "remove_carpet"))
      .toBe(true);
  });

  it("blocks two distinct drawn rooms from sharing one affected-area label", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [
        { ...linkedReading, sketchRoomId: "sr-bedroom-a", sketchRoom: { id: "sr-bedroom-a", name: "Bedroom" } },
        { ...linkedReading, id: "mr-2", sketchRoomId: "sr-bedroom-b", sketchRoom: { id: "sr-bedroom-b", name: "Bedroom" } },
      ],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Bedroom" }],
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("blocks a location-only reading that hints at a composite area but joins to none", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [{ ...linkedReading, sketchRoomId: null, sketchRoom: null, location: "Living Room North Wall" }],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Living Room — Rear Lounge" }],
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a meter reading on Master bedroom's east wall", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [{
        ...linkedReading,
        sketchRoomId: null,
        sketchRoom: null,
        location: "Master bedroom — east wall, 300mm from floor",
      }],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Master bedroom" }],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(mockClassificationCreate).toHaveBeenCalledOnce();
  });

  it("blocks a named Rear Suite reading from submitting under generic Master bedroom", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [{
        ...linkedReading,
        sketchRoomId: null,
        sketchRoom: null,
        location: "Master bedroom — Rear Suite North Wall",
      }],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Master bedroom" }],
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a location-only Bedroom 2 reading with distinct Bedroom and Bedroom 2 areas", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [{ ...linkedReading, sketchRoomId: null, sketchRoom: null, location: "Bedroom 2 North Wall" }],
      affectedAreas: [
        { ...livingRoomArea, id: "area-bedroom", roomZoneId: "Bedroom" },
        { ...livingRoomArea, id: "area-bedroom-2", roomZoneId: "Bedroom 2" },
      ],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(mockClassificationCreate).toHaveBeenCalledOnce();
  });

  it("blocks a location-only Bedroom 2 reading when only generic Bedroom exists", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [{ ...linkedReading, sketchRoomId: null, sketchRoom: null, location: "Bedroom 2 North Wall" }],
      affectedAreas: [{ ...livingRoomArea, roomZoneId: "Bedroom" }],
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a Kitchen decimal-distance reading without treating 1.2m as Kitchen 1", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [{ ...linkedReading, sketchRoomId: null, sketchRoom: null, location: "Kitchen 1.2m from sink" }],
      affectedAreas: [
        { ...livingRoomArea, id: "area-kitchen", roomZoneId: "Kitchen" },
        { ...livingRoomArea, id: "area-kitchen-1", roomZoneId: "Kitchen 1" },
      ],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(mockClassificationCreate).toHaveBeenCalledOnce();
  });

  it("blocks ambiguous Kitchen 1 m when Kitchen and Kitchen 1 both exist", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      moistureReadings: [{ ...linkedReading, sketchRoomId: null, sketchRoom: null, location: "Kitchen 1 m from sink" }],
      affectedAreas: [
        { ...livingRoomArea, id: "area-kitchen", roomZoneId: "Kitchen" },
        { ...livingRoomArea, id: "area-kitchen-1", roomZoneId: "Kitchen 1" },
      ],
      photos: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect(mockClassificationCreate).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("allows an unaffected linked baseline without inventing an affected area", async () => {
    mockInspectionFindUnique.mockResolvedValueOnce({
      id: "insp-1",
      status: "DRAFT",
      claimType: "WATER",
      propertyAddress: "1 Test St",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      reportId: null,
      environmentalData,
      moistureReadings: [{
        ...linkedReading,
        isBaseline: true,
        sketchRoomId: "sr-kitchen",
        sketchRoom: { id: "sr-kitchen", name: "Kitchen" },
      }],
      affectedAreas: [livingRoomArea],
      scopeItems: [],
      photos: [],
      waterDamageClassification: null,
    });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect((mockInspectionFindUnique.mock.calls[0]?.[0] as {
      include: { moistureReadings: { select: { isBaseline?: boolean } } };
    }).include.moistureReadings.select.isBaseline).toBe(true);
  });
});
