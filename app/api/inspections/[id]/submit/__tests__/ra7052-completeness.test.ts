/**
 * RA-7052: submit route captures the "after" completeness snapshot onto any
 * open Live Teacher session (finalCompletionPct + endedAt), best-effort and
 * non-blocking. Mocks the compliance-gate and processing dependency tree so
 * the test exercises only the snapshot behaviour around the successful CAS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Auth ─────────────────────────────────────────────────────────────────────
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// ── Idempotency wrapper — just run the callback ────────────────────────────────
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _req: unknown,
    _userId: unknown,
    fn: (rawBody?: string) => Promise<Response>,
  ) => fn(),
}));

// ── Tenancy — owner write allowed ──────────────────────────────────────────────
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: vi.fn().mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: { id: "insp-1" } },
  }),
}));

// ── Precondition + compliance gates: all pass ──────────────────────────────────
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

// ── Downstream processing (processInspectionComplete deps) — no-op ─────────────
vi.mock("@/lib/nir-classification-engine", () => ({ classifyIICRC: vi.fn() }));
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn().mockResolvedValue(null),
  checkBuildingCodeTriggers: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/nir-scope-determination", () => ({
  determineScopeItems: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn().mockResolvedValue({ items: [], contingency: 0 }),
}));

// ── The RA-7052 gate under test ────────────────────────────────────────────────
const mockValidateSubmission = vi.fn();
vi.mock("@/lib/evidence/submission-gate", () => ({
  validateSubmission: (...args: unknown[]) => mockValidateSubmission(...args),
}));

// ── Prisma ─────────────────────────────────────────────────────────────────────
const mockInspectionFindUnique = vi.fn();
const mockInspectionUpdateMany = vi.fn();
const mockInspectionUpdate = vi.fn().mockResolvedValue({});
const mockLiveTeacherUpdateMany = vi.fn();
const mockPilotCreate = vi.fn().mockResolvedValue({});
const mockAuditCreate = vi.fn().mockResolvedValue({});
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
      updateMany: (...a: unknown[]) => mockLiveTeacherUpdateMany(...a),
    },
    pilotObservation: { create: (...a: unknown[]) => mockPilotCreate(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
    scopeItem: { createMany: (...a: unknown[]) => mockScopeItemCreateMany(...a) },
    costEstimate: {
      createMany: (...a: unknown[]) => mockCostEstimateCreateMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

function makeSubmitRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp-1/submit", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "insp-1" }) };

const baseInspection = {
  id: "insp-1",
  status: "DRAFT",
  claimType: "WATER", // → WATER_DAMAGE workflow
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  inspectionDate: new Date(),
  reportId: null,
  environmentalData: null,
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  photos: [],
};

describe("submit route — RA-7052 final-completeness snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "t@example.com" },
    } as any);
    mockInspectionFindUnique.mockResolvedValue({ ...baseInspection });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 }); // CAS wins
    mockInspectionUpdate.mockResolvedValue({});
    mockPilotCreate.mockResolvedValue({});
    mockAuditCreate.mockResolvedValue({});
    mockScopeItemCreateMany.mockResolvedValue({ count: 0 });
    mockCostEstimateCreateMany.mockResolvedValue({ count: 0 });
  });

  it("writes finalCompletionPct + endedAt on the open session and succeeds", async () => {
    // Seeded start snapshot was 40; the after-snapshot resolves to 72.
    mockValidateSubmission.mockResolvedValue({ completionPercentage: 72 });
    mockLiveTeacherUpdateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);

    expect(res.status).toBe(200);
    expect(mockValidateSubmission).toHaveBeenCalledWith("insp-1", "WATER_DAMAGE");
    expect(mockLiveTeacherUpdateMany).toHaveBeenCalledTimes(1);
    const call = mockLiveTeacherUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      inspectionId: "insp-1",
      finalCompletionPct: null,
    });
    expect(call.data.finalCompletionPct).toBe(72);
    expect(call.data.endedAt).toBeInstanceOf(Date);

    // Delta against the seeded start snapshot is computable.
    const startCompletionPct = 40;
    expect(call.data.finalCompletionPct - startCompletionPct).toBe(32);
  });

  it("succeeds when there is no open session (updateMany count 0 is a no-op)", async () => {
    mockValidateSubmission.mockResolvedValue({ completionPercentage: 55 });
    mockLiveTeacherUpdateMany.mockResolvedValue({ count: 0 });

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);

    expect(res.status).toBe(200);
    expect(mockLiveTeacherUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("succeeds even when the completeness gate throws (non-blocking)", async () => {
    mockValidateSubmission.mockRejectedValue(new Error("gate boom"));

    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);

    expect(res.status).toBe(200);
    // The gate threw before the session write, so no update was attempted.
    expect(mockLiveTeacherUpdateMany).not.toHaveBeenCalled();
  });
});
