/**
 * RA-8498 (DRC S5): the job's submit refuses while a site visit on it is
 * still open (started, not yet submitted), and refuses before any write, so
 * a refusal leaves nothing behind (no CLAIM-003 observation, no CAS). A job
 * with no visits, or only submitted ones, submits exactly as before.
 *
 * Harness copied from office-notice.test.ts (RA-8503).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

vi.mock("@/lib/voice/fire-smoke/server", () => ({
  checkFireSubmitGate: async () => ({ blocked: false }),
  claimSubmitWithFireGate: (db: unknown, _inspection: unknown, claim: (tx: unknown) => unknown) =>
    claim(db),
}));
const mockAfter = vi.fn();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => mockAfter(task),
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
    data: { inspectionManyWhere: { id: "insp-1" }, viaAssignment: true },
  }),
}));
vi.mock("@/lib/services/inspection/validate-submission", () => ({
  validateSubmissionPayload: vi.fn().mockReturnValue({ ok: true }),
}));
const mockTiered = vi.fn();
vi.mock("@/lib/nir-tiered-completion", () => ({
  validateTieredCompletion: (...a: unknown[]) => mockTiered(...a),
}));
vi.mock("@/lib/compliance/make-safe-gate", () => ({
  checkMakeSafeGate: vi.fn().mockResolvedValue({ canSubmit: true, blockers: [] }),
}));
vi.mock("@/lib/compliance/seed-make-safe", () => ({
  ensureMakeSafeSeeded: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/compliance/scope-variation-gate", () => ({
  checkScopeVariationGate: vi.fn().mockResolvedValue({ canSubmit: true, blockers: [] }),
}));
vi.mock("@/lib/compliance/nz-moisture-gate", () => ({
  checkNzMoistureGate: vi.fn().mockResolvedValue({ warnings: [] }),
}));
vi.mock("@/lib/compliance/safework-notification-gate", () => ({
  checkSafeworkGate: vi.fn().mockResolvedValue({ notifications: [] }),
}));
vi.mock("@/lib/compliance/nzbs-compliance-gate", () => ({
  checkNzbsGate: vi.fn().mockResolvedValue({ canSubmit: true, blockers: [], requiredClauses: [] }),
}));
vi.mock("@/lib/compliance/moisture-trend-anomaly", () => ({
  detectMoistureTrendAnomalies: vi.fn().mockResolvedValue({ hasAnomalies: false, anomalies: [] }),
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
vi.mock("@/lib/integrations/zoho/queue", () => ({
  scheduleZohoInspectionPush: vi.fn(),
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({
  recordFirstReportSaved: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pulse/notify-client-change", () => ({
  notifyClientStepChange: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn().mockResolvedValue(null),
  checkBuildingCodeTriggers: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn().mockResolvedValue({ items: [], contingency: 0 }),
  resolveInspectionRates: vi.fn().mockResolvedValue({ ok: false }),
}));

const mockNotice = vi.fn();
vi.mock("@/lib/office-notice/submit-notice", () => ({
  notifyOfficeOfSubmittedVisit: (...a: unknown[]) => mockNotice(...a),
}));

const mockInspectionFindUnique = vi.fn();
const mockInspectionUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...a: unknown[]) => mockInspectionFindUnique(...a),
      updateMany: (...a: unknown[]) => mockInspectionUpdateMany(...a),
      update: vi.fn().mockResolvedValue({}),
    },
    liveTeacherSession: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    pilotObservation: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    classification: { findFirst: async () => null, create: vi.fn() },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ classification: { findFirst: async () => null, create: vi.fn().mockResolvedValue({ id: "c-1" }) } }),
    affectedArea: { update: vi.fn().mockResolvedValue({}) },
    scopeItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    costEstimate: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

const inspection = {
  id: "insp-1",
  userId: "owner-1",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-20T00:00:00Z"),
  status: "DRAFT",
  claimType: null,
  inspectionNumber: "NIR-2026-11-0042",
  technicianName: "Sam Field",
  propertyAddress: "12 Sample Street",
  propertyPostcode: "2150",
  inspectionDate: new Date(),
  reportId: null,
  environmentalData: null,
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  photos: [],
  evidenceItems: [],
  siteVisits: [] as Array<{ visitNumber: number }>,
};

const params = { params: Promise.resolve({ id: "insp-1" }) };
const submit = () =>
  new NextRequest("http://localhost/api/inspections/insp-1/submit", { method: "POST" });

const canSubmit = {
  canSubmit: true,
  missingCritical: [],
  missingSupplementary: [],
  warnings: [],
  summary: {},
};

describe("submit route: RA-8498 open site visit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "tech-1", name: "Sam Field", email: "tech@example.com" },
    } as never);
    mockInspectionFindUnique.mockResolvedValue({ ...inspection });
    mockInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mockTiered.mockReturnValue(canSubmit);
    mockNotice.mockResolvedValue(undefined);
  });

  it("asks for only the open visits, in the query it already makes", async () => {
    const { POST } = await import("../route");
    await POST(submit(), params);
    const include = mockInspectionFindUnique.mock.calls[0][0].include;
    expect(include.siteVisits).toEqual({
      where: { submittedAt: null },
      select: { visitNumber: true },
      orderBy: { visitNumber: "asc" },
      take: 1,
    });
  });

  it("422 SITE_VISIT_OPEN while a visit is open, before any write", async () => {
    mockInspectionFindUnique.mockResolvedValue({ ...inspection, siteVisits: [{ visitNumber: 2 }] });
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    await expectRefused(res, 422, /SITE_VISIT_OPEN/);
    const { prisma } = await import("@/lib/prisma");
    expect(prisma.pilotObservation.create).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it("the refusal names the open visit", async () => {
    mockInspectionFindUnique.mockResolvedValue({ ...inspection, siteVisits: [{ visitNumber: 2 }] });
    const { POST } = await import("../route");
    await expectRefused(await POST(submit(), params), 422, /Visit 2 is still open/);
  });

  it("a job with no open visit submits as before (the gate can say yes)", async () => {
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    expect(res.status).toBe(200);
    expect(mockInspectionUpdateMany).toHaveBeenCalledTimes(1);
  });
});
