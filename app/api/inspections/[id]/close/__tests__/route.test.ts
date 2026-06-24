/**
 * SP-A Task 7 — POST /api/inspections/[id]/close tests.
 *
 * Verifies auth, tenancy, precondition gating, atomic CAS, transition write,
 * and the SP-E fire-and-forget contract.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const assertInspectionTenancy = vi.fn();
const resolveInspectionWrite = vi.fn();
const exportClosedJobToBYOKStorage = vi.fn();
const writeLifecycleTransition = vi.fn();
const loadTransitionContext = vi.fn();
const inspectionUpdateMany = vi.fn();
const inspectionUpdate = vi.fn();
const claimProgressUpdateMany = vi.fn();
const prismaTransaction = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));
vi.mock("@/lib/queue/exportClosedJobToBYOKStorage", () => ({
  exportClosedJobToBYOKStorage: (...a: unknown[]) =>
    exportClosedJobToBYOKStorage(...a),
}));
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: (...a: unknown[]) =>
    writeLifecycleTransition(...a),
}));
vi.mock("@/lib/lifecycle/load-context", () => ({
  loadTransitionContext: (...a: unknown[]) => loadTransitionContext(...a),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    _req: unknown,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => {
    const req = _req as { text: () => Promise<string> };
    const body = await req.text();
    return handler(body);
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      prismaTransaction(fn),
    inspection: {
      update: (...a: unknown[]) => inspectionUpdate(...a),
    },
  },
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  assertInspectionTenancy.mockReset();
  resolveInspectionWrite.mockReset();
  exportClosedJobToBYOKStorage.mockReset();
  writeLifecycleTransition.mockReset();
  loadTransitionContext.mockReset();
  inspectionUpdateMany.mockReset();
  inspectionUpdate.mockReset();
  claimProgressUpdateMany.mockReset();
  prismaTransaction.mockReset();

  // Default: transaction runs the callback with a tx mock that mirrors
  // the writes a real Prisma client would do.
  prismaTransaction.mockImplementation(async (fn) =>
    fn({
      inspection: { updateMany: inspectionUpdateMany },
      claimProgress: { updateMany: claimProgressUpdateMany },
    }),
  );
  inspectionUpdateMany.mockResolvedValue({ count: 1 });
  claimProgressUpdateMany.mockResolvedValue({ count: 1 });
  resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "ins_1" },
      inspectionManyWhere: { id: "ins_1" },
      childInspectionFilter: undefined,
    },
  });
  writeLifecycleTransition.mockResolvedValue({
    id: "trans_1",
    auditLogId: "audit_1",
  });
  exportClosedJobToBYOKStorage.mockResolvedValue({
    storageKey: "closures/org_1/ins_1/job-package.zip",
    byteSize: 123,
    mirrorJobId: "mj_1",
  });
});

function makeReq(body: unknown = { closeSummary: "summary" }): NextRequest {
  return new NextRequest("http://localhost/api/inspections/ins_1/close", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const routeParams = { params: Promise.resolve({ id: "ins_1" }) };

describe("POST /api/inspections/[id]/close — auth + body", () => {
  it("401 unauthed", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(401);
  });

  it("400 when closeSummary missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await POST(makeReq({}), routeParams);
    expect(res.status).toBe(400);
  });

  it("404 when tenancy fails", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    resolveInspectionWrite.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/inspections/[id]/close — preconditions", () => {
  it("409 with missing[] when invoice not paid", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    loadTransitionContext.mockResolvedValueOnce({
      invoiceStatus: "SENT",
      reportStatus: "COMPLETED",
      handoverCompletedAt: new Date(),
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.missing).toContain("invoice_paid");
  });

  it("409 with missing report_sent when report not COMPLETED", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    loadTransitionContext.mockResolvedValueOnce({
      invoiceStatus: "PAID",
      reportStatus: "DRAFT",
      handoverCompletedAt: new Date(),
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.missing).toContain("report_sent");
  });

  it("409 status_drift when CAS finds row already CLOSED", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    loadTransitionContext.mockResolvedValueOnce({
      invoiceStatus: "PAID",
      reportStatus: "COMPLETED",
      handoverCompletedAt: new Date(),
    });
    inspectionUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.missing).toContain("status_drift");
  });
});

describe("POST /api/inspections/[id]/close — happy path", () => {
  it("200 + writes transition + fire-and-forget SP-E mirror", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "Alice Tradie", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    loadTransitionContext.mockResolvedValueOnce({
      invoiceStatus: "PAID",
      reportStatus: "COMPLETED",
      handoverCompletedAt: new Date(),
    });

    const res = await POST(makeReq(), routeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.transitionId).toBe("trans_1");

    expect(inspectionUpdateMany).toHaveBeenCalledTimes(1);
    const casCall = inspectionUpdateMany.mock.calls[0][0];
    expect(casCall.where.status).toBe("IN_BILLING");
    expect(casCall.data.status).toBe("CLOSED");

    expect(writeLifecycleTransition).toHaveBeenCalledTimes(1);
    expect(claimProgressUpdateMany).toHaveBeenCalledTimes(1);

    // Wait a microtask for the fire-and-forget chain to flush.
    await new Promise((r) => setTimeout(r, 10));
    expect(exportClosedJobToBYOKStorage).toHaveBeenCalledWith("ins_1");
  });

  it("200 even when SP-E export throws (fire-and-forget per rule 13)", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "Alice", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    loadTransitionContext.mockResolvedValueOnce({
      invoiceStatus: "PAID",
      reportStatus: "COMPLETED",
      handoverCompletedAt: new Date(),
    });
    exportClosedJobToBYOKStorage.mockRejectedValueOnce(
      new Error("supabase down"),
    );

    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
  });
});
