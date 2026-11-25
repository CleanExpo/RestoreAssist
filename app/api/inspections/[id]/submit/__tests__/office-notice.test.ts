/**
 * RA-8503: the office is told once when a technician submits a visit.
 *
 * The notice fires only when the submit's CAS wins the DRAFT to SUBMITTED
 * transition, and it carries the submittedAt that CAS wrote, which is the
 * key the delivery ledger uses to send the email at most once. A retry that
 * loses the CAS, or a submit a gate refuses, tells nobody.
 *
 * RA-8525: the notice starts inside the after() callback, never before it.
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
/** Run every task the route handed to after(), as Next.js does post-response. */
async function runAfterTasks(): Promise<void> {
  for (const [task] of mockAfter.mock.calls) await (task as () => unknown)();
}
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

describe("submit route — RA-8503 office notice", () => {
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

  it("tells the office once, with the submittedAt the CAS wrote", async () => {
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    expect(res.status).toBe(200);
    await runAfterTasks();

    expect(mockNotice).toHaveBeenCalledTimes(1);
    const arg = mockNotice.mock.calls[0][0] as {
      inspectionId: string;
      submittedAt: Date;
      submitterName: string;
    };
    expect(arg.inspectionId).toBe("insp-1");
    expect(arg.submitterName).toBe("Sam Field");
    const casData = mockInspectionUpdateMany.mock.calls[0][0].data as { submittedAt: Date };
    expect(arg.submittedAt).toBeInstanceOf(Date);
    // The same Date object the CAS wrote, not an equal time taken a moment later.
    expect(arg.submittedAt).toBe(casData.submittedAt);
  });

  it("a retried submit that loses the CAS tells nobody again", async () => {
    const { POST } = await import("../route");
    expect((await POST(submit(), params)).status).toBe(200);

    mockInspectionUpdateMany.mockResolvedValue({ count: 0 });
    mockInspectionFindUnique.mockResolvedValue({ ...inspection, status: "SUBMITTED" });
    const retry = await POST(submit(), params);
    await expectRefused(retry, 409, /already submitted/);
    await runAfterTasks();

    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  it("a submit a gate refuses tells nobody", async () => {
    mockTiered.mockReturnValue({
      ...canSubmit,
      canSubmit: false,
      missingCritical: [{ fieldName: "photos", label: "Photos", clauseRef: "x", rationale: "y" }],
    });
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    await expectRefused(res, 400, /critical fields missing/);
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockNotice).not.toHaveBeenCalled();
    expect(mockInspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("holds the request open until the notice finishes", async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockNotice.mockReturnValue(pending);
    const { POST } = await import("../route");
    expect((await POST(submit(), params)).status).toBe(200);

    expect(mockAfter).toHaveBeenCalledTimes(1);
    const held = mockAfter.mock.calls[0][0]() as Promise<void>;
    let settled = false;
    void held.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await held;
    expect(settled).toBe(true);
  });

  it("a failing notice does not fail the submit", async () => {
    mockNotice.mockRejectedValue(new Error("mail down"));
    const { POST } = await import("../route");
    const res = await POST(submit(), params);
    expect(res.status).toBe(200);
    await runAfterTasks();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  it("RA-8525: does not start the notice until after() runs it", async () => {
    const { POST } = await import("../route");
    expect((await POST(submit(), params)).status).toBe(200);

    // The response is back and after() holds the task, but nothing has been
    // sent: the notice starts only when Next.js runs the callback.
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockNotice).not.toHaveBeenCalled();

    await runAfterTasks();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  it("RA-8525: outside a request scope the notice still goes once", async () => {
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });
    const { POST } = await import("../route");
    expect((await POST(submit(), params)).status).toBe(200);
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });
});
