/**
 * RA-7610: a reading created against a SketchRoom reference must join to the
 * matching affected area even when its free-text location does not contain
 * the room name. On main the join is location-only, so "North Wall" misses
 * "Living room" and carpet removal never enters the scope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sqmToSqft } from "@/lib/units";

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
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn().mockResolvedValue(null),
  checkBuildingCodeTriggers: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn().mockResolvedValue({ items: [], contingency: 0 }),
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
      create: (...a: unknown[]) => mockClassificationCreate(...a),
    },
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
});
