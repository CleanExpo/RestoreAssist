/**
 * Fire and smoke walkthrough gate, wired into the real submit route. The
 * REAL fire gate and status code run; only the database is mocked (setup
 * mirrors ra7739-make-safe-not-assessed.test.ts). Deleting the gate block
 * from the route must turn the refusal tests red.
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
  assertInspectionAssignedWrite: vi.fn().mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: { id: "insp-1" }, viaAssignment: false },
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
  resolveInspectionRates: vi.fn().mockResolvedValue({ ok: true, rates: null }),
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
const mockFireObsFindMany = vi.fn();
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
    voiceCopilotObservation: { findMany: (...a: unknown[]) => mockFireObsFindMany(...a) },
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

import { FIRE_SECTION_IDS } from "@/lib/voice/fire-smoke/checklist";

const v = 1;
let t = Date.parse("2026-11-11T09:00:00Z");
let seq = 0;
const at = () => new Date((t += 60_000));
const entry = (sectionId: string, createdAt: Date = at()) => ({
  id: `obs-${(seq += 1)}`,
  sessionId: "vs-1",
  type: "fire_section_entry",
  parsed: { checklistVersion: v, sectionId, note: "Synthetic note", routedBy: "router" },
  createdAt,
});
const signoff = (covered: Array<{ id: string; createdAt: Date }>, createdAt: Date = at()) => ({
  id: `obs-${(seq += 1)}`,
  sessionId: "vs-1",
  type: "fire_walkthrough_signoff",
  parsed: {
    checklistVersion: v,
    typedName: "Sam Example",
    declarationAccepted: true,
    signerUserId: "user-1",
    coversThrough: covered[covered.length - 1].createdAt.toISOString(),
    coveredRowIds: covered.map((row) => row.id),
    sectionStates: {},
  },
  createdAt,
});
const passingMakeSafe = ALL_ACTIONS.map((action) => ({
  action,
  applicable: action === "occupant_briefing",
  completed: action === "occupant_briefing",
}));

describe("submit route — fire and smoke walkthrough gate", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1", email: "t@example.com" } } as any);
    mockInspectionFindUnique.mockResolvedValue({ ...baseInspection, claimType: "FIRE" });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mockInspectionUpdate.mockResolvedValue({});
    mockPilotCreate.mockResolvedValue({});
    mockAuditCreate.mockResolvedValue({});
    mockScopeItemCreateMany.mockResolvedValue({ count: 0 });
    mockCostEstimateCreateMany.mockResolvedValue({ count: 0 });
    mockValidateSubmission.mockResolvedValue({ completionPercentage: 50 });
    mockLiveTeacherFindFirst.mockResolvedValue(null);
    mockMakeSafeFindMany.mockResolvedValue(passingMakeSafe);
  });

  it.each(["FIRE", "HVAC"])("refuses a started, unsigned walkthrough (claimType %s)", async (claimType) => {
    mockInspectionFindUnique.mockResolvedValue({ ...baseInspection, claimType });
    mockFireObsFindMany.mockResolvedValue([entry("structure")]);
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("SECTIONS_OPEN");
    expect(body.openSectionIds).toContain("safety_brief");
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
    // A refusal writes nothing: the gate runs before every submit side effect.
    expect(mockPilotCreate).not.toHaveBeenCalled();
    expect(mockMakeSafeFindMany).not.toHaveBeenCalled();
  });

  it("refuses a walkthrough changed after sign-off", async () => {
    const rows = FIRE_SECTION_IDS.map((id) => entry(id));
    mockFireObsFindMany.mockResolvedValue([...rows, signoff(rows), entry("contents")]);
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("CHANGED_AFTER_SIGNOFF");
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an uncovered edit stamped with the coversThrough millisecond", async () => {
    const rows = FIRE_SECTION_IDS.map((id) => entry(id));
    // The edit carries the same millisecond as coversThrough (the newest covered row).
    const tie = rows[rows.length - 1].createdAt;
    mockFireObsFindMany.mockResolvedValue([...rows, signoff(rows), entry("contents", tie)]);
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("CHANGED_AFTER_SIGNOFF");
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("lets a signed walkthrough through", async () => {
    const rows = FIRE_SECTION_IDS.map((id) => entry(id));
    mockFireObsFindMany.mockResolvedValue([...rows, signoff(rows)]);
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("[fire-walkthrough-gate]", expect.objectContaining({ outcome: "signed" }));
  });

  it("lets a fire claim with no walkthrough through and logs no_walkthrough", async () => {
    mockFireObsFindMany.mockResolvedValue([]);
    const { POST } = await import("../route");
    const res = await POST(makeSubmitRequest(), params);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("[fire-walkthrough-gate]", expect.objectContaining({ outcome: "no_walkthrough" }));
  });
});
