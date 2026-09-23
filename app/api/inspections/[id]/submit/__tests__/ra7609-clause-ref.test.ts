/**
 * RA-7609: ScopeItem.clauseRef is never written on inspection submit.
 * determineScopeItems already computes clauseRefs[]; the createMany payload
 * omits the column, so every auto-determined item is stored with clauseRef null.
 *
 * Found by reading the code, not by executing it. This test must fail on
 * current main before the write is added.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sqmToSqft } from "@/lib/units";
import { determineScopeItems } from "@/lib/nir-scope-determination";

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

const livingRoomReading = {
  id: "mr-1",
  location: "Living Room North Wall",
  surfaceType: "carpet",
  moistureLevel: 10,
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

const ra7609Inspection = {
  id: "insp-1",
  status: "DRAFT",
  claimType: "WATER",
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  inspectionDate: new Date(),
  reportId: null,
  environmentalData,
  moistureReadings: [livingRoomReading],
  affectedAreas: [livingRoomArea],
  scopeItems: [],
  photos: [],
  waterDamageClassification: null,
};

function makeSubmitRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp-1/submit", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "insp-1" }) };

type CreatedScopeItem = {
  itemType: string;
  justification: string | null;
  clauseRef: string | null | undefined;
};

function createdScopeItems(): CreatedScopeItem[] {
  const call = mockScopeItemCreateMany.mock.calls[0];
  if (!call) return [];
  return (call[0] as { data: CreatedScopeItem[] }).data;
}

function expectedDeterminedItems() {
  return determineScopeItems({
    category: "2",
    class: "2",
    waterSource: livingRoomArea.waterSource,
    affectedAreas: [
      {
        roomZoneId: livingRoomArea.roomZoneId,
        affectedSquareFootage: AREA_SQM,
        surfaceType: livingRoomReading.surfaceType,
        moistureLevel: livingRoomReading.moistureLevel,
      },
    ],
    environmentalData,
  });
}

describe("submit route — RA-7609 clauseRef persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "t@example.com" },
    } as never);
    mockInspectionFindUnique.mockResolvedValue({ ...ra7609Inspection });
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

  it("stores determineScopeItems clauseRefs[0] on each created ScopeItem", async () => {
    const expected = expectedDeterminedItems();
    const withClause = expected.filter((item) => item.clauseRefs?.[0]);
    expect(withClause.length).toBeGreaterThan(0);

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);

    expect(mockScopeItemCreateMany).toHaveBeenCalled();
    const items = createdScopeItems();
    expect(items.length).toBe(expected.length);

    for (const determined of withClause) {
      const stored = items.find((item) => item.itemType === determined.itemType);
      expect(stored, determined.itemType).toBeDefined();
      expect(stored?.clauseRef).toBe(determined.clauseRefs?.[0]);
      expect(stored?.justification).toBe(determined.justification);
    }
  });
});
