/**
 * RA-7739: an inspection whose Stabilisation checklist has nothing marked
 * applicable (the untouched intake seed) is refused at submit, and the
 * technician sees a plain-English reason. The real make-safe gate runs; only
 * the database and unrelated dependencies are mocked (setup mirrors
 * ra7052-completeness.test.ts).
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
// The REAL make-safe gate runs; only its database read is mocked.
vi.mock("@/app/api/inspections/[id]/make-safe/route", () => ({
  MAKE_SAFE_ACTIONS: [
    "power_isolated",
    "gas_isolated",
    "mould_containment",
    "water_stopped",
    "occupant_briefing",
  ] as const,
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

const mockValidateSubmission = vi.fn();
vi.mock("@/lib/evidence/submission-gate", () => ({
  validateSubmission: (...args: unknown[]) => mockValidateSubmission(...args),
}));

// ── Prisma ─────────────────────────────────────────────────────────────────────
const mockInspectionFindUnique = vi.fn();
const mockInspectionUpdateMany = vi.fn();
const mockInspectionUpdate = vi.fn().mockResolvedValue({});
const mockLiveTeacherFindFirst = vi.fn();
const mockLiveTeacherUpdate = vi.fn();
const mockPilotCreate = vi.fn().mockResolvedValue({});
const mockMakeSafeFindMany = vi.fn();
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
      findFirst: (...a: unknown[]) => mockLiveTeacherFindFirst(...a),
      update: (...a: unknown[]) => mockLiveTeacherUpdate(...a),
    },
    pilotObservation: { create: (...a: unknown[]) => mockPilotCreate(...a) },
    makeSafeAction: { findMany: (...a: unknown[]) => mockMakeSafeFindMany(...a) },
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

const ALL_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];

describe("submit route — RA-7739 all-N/A Stabilisation checklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "t@example.com" },
    } as any);
    mockInspectionFindUnique.mockResolvedValue({ ...baseInspection });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mockInspectionUpdate.mockResolvedValue({});
    mockPilotCreate.mockResolvedValue({});
    mockAuditCreate.mockResolvedValue({});
    mockScopeItemCreateMany.mockResolvedValue({ count: 0 });
    mockCostEstimateCreateMany.mockResolvedValue({ count: 0 });
    mockValidateSubmission.mockResolvedValue({ completionPercentage: 50 });
    mockLiveTeacherFindFirst.mockResolvedValue(null);
  });

  it("refuses the intake seed with a reason the technician can act on", async () => {
    mockMakeSafeFindMany.mockResolvedValue(
      ALL_ACTIONS.map((action) => ({ action, applicable: false, completed: false })),
    );
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/stabilisation checklist/i);
    expect(body.error).toMatch(/applicable/i);
    expect(body.error).not.toMatch(/incomplete/i);
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("lets the submit through once an applicable item is completed", async () => {
    mockMakeSafeFindMany.mockResolvedValue(
      ALL_ACTIONS.map((action) => ({
        action,
        applicable: action === "occupant_briefing",
        completed: action === "occupant_briefing",
      })),
    );
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
  });
});
