/**
 * RA-7893: a submitted inspection is estimated at the pricing of the
 * business it belongs to (resolveInspectionRates, keyed by the creator and
 * the creation time), never by a pricing lookup on the member's own id. When
 * that business cannot be proven, nothing is priced.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
  checkMakeSafeGate: vi
    .fn()
    .mockResolvedValue({ canSubmit: true, blockers: [] }),
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

const mockEstimateCosts = vi.fn();
const mockResolveInspectionRates = vi.fn();
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: (...a: unknown[]) => mockEstimateCosts(...a),
  resolveInspectionRates: (...a: unknown[]) => mockResolveInspectionRates(...a),
}));

const mockInspectionFindUnique = vi.fn();
const mockInspectionUpdateMany = vi.fn();
const mockInspectionUpdate = vi.fn().mockResolvedValue({});
const mockLiveTeacherFindFirst = vi.fn().mockResolvedValue(null);
const mockClassificationCreate = vi.fn();
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
      update: vi.fn(),
    },
    pilotObservation: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    classification: {
      findFirst: async () => null,
      create: (...a: unknown[]) => mockClassificationCreate(...a),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        classification: {
          findFirst: async () => null,
          create: (...a: unknown[]) => mockClassificationCreate(...a),
        },
      }),
    affectedArea: { update: vi.fn().mockResolvedValue({}) },
    scopeItem: {
      createMany: (...a: unknown[]) => mockScopeItemCreateMany(...a),
    },
    costEstimate: {
      createMany: (...a: unknown[]) => mockCostEstimateCreateMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

const CREATED_AT = new Date("2026-09-01T00:00:00Z");
const BUSINESS_RATES = { callOutFee: 150 };

const inspection = {
  id: "insp-1",
  userId: "member-1",
  createdAt: CREATED_AT,
  status: "DRAFT",
  claimType: "WATER",
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  inspectionDate: new Date(),
  reportId: null,
  environmentalData: {
    id: "env-1",
    ambientTemperature: 22,
    humidityLevel: 55,
    dewPoint: 12,
    airCirculation: false,
  },
  moistureReadings: [
    {
      id: "mr-1",
      location: "Living room",
      surfaceType: "carpet",
      moistureLevel: 10,
      depth: "Surface",
    },
  ],
  affectedAreas: [
    {
      id: "area-1",
      roomZoneId: "Living room",
      affectedAreaSqm: 22,
      affectedSquareFootage: 236.8,
      waterSource: "Grey water",
      timeSinceLoss: 24,
      category: null,
      class: null,
    },
  ],
  scopeItems: [],
  photos: [],
  waterDamageClassification: null,
};

const params = { params: Promise.resolve({ id: "insp-1" }) };

function submit(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp-1/submit", {
    method: "POST",
  });
}

function statusesWritten(): string[] {
  return mockInspectionUpdate.mock.calls.map(
    (call) => (call[0] as { data: { status?: string } }).data.status ?? "",
  );
}

describe("submit route — RA-7893 business pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "member-1", email: "m@example.com" },
    } as never);
    mockInspectionFindUnique.mockResolvedValue({ ...inspection });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mockInspectionUpdate.mockResolvedValue({});
    mockClassificationCreate.mockImplementation(
      async ({ data }: { data: unknown }) => ({
        id: "class-1",
        ...(data as object),
      }),
    );
    mockScopeItemCreateMany.mockResolvedValue({ count: 0 });
    mockCostEstimateCreateMany.mockResolvedValue({ count: 0 });
    mockLiveTeacherFindFirst.mockResolvedValue(null);
    mockEstimateCosts.mockResolvedValue({ items: [], contingency: 0 });
  });

  it("estimates at the business's rates, resolved from the creator and creation time", async () => {
    mockResolveInspectionRates.mockResolvedValue({
      ok: true,
      rates: BUSINESS_RATES,
    });
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    expect(res.status).toBe(200);

    expect(mockResolveInspectionRates).toHaveBeenCalledWith(
      "member-1",
      CREATED_AT,
    );
    expect(mockEstimateCosts).toHaveBeenCalledTimes(1);
    const [, , rates, userId] = mockEstimateCosts.mock.calls[0];
    expect(rates).toBe(BUSINESS_RATES);
    // No id handed over, so estimateCosts cannot look pricing up by itself.
    expect(userId).toBeNull();
    expect(statusesWritten()).toContain("ESTIMATED");
  });

  it("prices nothing when the inspection's business cannot be proven", async () => {
    mockResolveInspectionRates.mockResolvedValue({ ok: false });
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    expect(res.status).toBe(200);

    expect(mockEstimateCosts).not.toHaveBeenCalled();
    expect(mockCostEstimateCreateMany).not.toHaveBeenCalled();
    expect(statusesWritten()).toContain("SCOPED");
    expect(statusesWritten()).not.toContain("ESTIMATED");
  });
});
