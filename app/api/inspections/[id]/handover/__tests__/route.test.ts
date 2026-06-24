/**
 * SP-J — POST /api/inspections/[id]/handover tests.
 *
 * Auth + tenancy + status-gate + idempotency + happy-path coverage. Mirrors
 * the close-route test shape so a future review can diff them side-by-side.
 *
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §9.
 * Punchlist ref: docs/discovery/2026-05-15-punchlist.md VERIFIED P0 #1.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const assertInspectionTenancy = vi.fn();
const resolveInspectionWrite = vi.fn();
const exportHandoverPackageToBYOKStorage = vi.fn();
const writeLifecycleTransition = vi.fn();
const inspectionFindUnique = vi.fn();
const inspectionUpdateMany = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));
vi.mock("@/lib/queue/exportHandoverPackageToBYOKStorage", () => ({
  exportHandoverPackageToBYOKStorage: (...a: unknown[]) =>
    exportHandoverPackageToBYOKStorage(...a),
}));
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: (...a: unknown[]) =>
    writeLifecycleTransition(...a),
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
    inspection: {
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
      updateMany: (...a: unknown[]) => inspectionUpdateMany(...a),
    },
  },
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: (...a: unknown[]) => createSignedUrl(...a),
      }),
    },
  }),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  assertInspectionTenancy.mockReset();
  resolveInspectionWrite.mockReset();
  exportHandoverPackageToBYOKStorage.mockReset();
  writeLifecycleTransition.mockReset();
  inspectionFindUnique.mockReset();
  inspectionUpdateMany.mockReset();
  createSignedUrl.mockReset();

  // Default happy-path doubles. Each `it()` overrides as needed.
  inspectionFindUnique.mockResolvedValue({
    status: "CLOSED",
    handoverCompletedAt: null,
  });
  inspectionUpdateMany.mockResolvedValue({ count: 1 });
  resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "ins_1" },
      inspectionManyWhere: { id: "ins_1" },
      childInspectionFilter: undefined,
    },
  });
  exportHandoverPackageToBYOKStorage.mockResolvedValue({
    storageKey: "handovers/org_1/ins_1/handover-package.zip",
    byteSize: 456,
    mirrorJobId: "mj_h_1",
  });
  writeLifecycleTransition.mockResolvedValue({
    id: "trans_h_1",
    auditLogId: "audit_h_1",
  });
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/handover.zip" },
    error: null,
  });
});

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/ins_1/handover", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });
}

const routeParams = { params: Promise.resolve({ id: "ins_1" }) };

describe("POST /api/inspections/[id]/handover — auth + tenancy", () => {
  it("401 when no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(401);
  });

  it("404 when tenancy fails (different org)", async () => {
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

describe("POST /api/inspections/[id]/handover — status gate", () => {
  it("409 when inspection is not CLOSED (e.g. IN_BILLING)", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    inspectionFindUnique.mockResolvedValueOnce({
      status: "IN_BILLING",
      handoverCompletedAt: null,
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.missing).toContain("invalid_transition");
  });

  it("409 when already handed over (idempotency)", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    inspectionFindUnique.mockResolvedValueOnce({
      status: "CLOSED",
      handoverCompletedAt: new Date("2026-05-15T01:00:00Z"),
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.missing).toContain("handover_already_done");
  });
});

describe("POST /api/inspections/[id]/handover — happy path", () => {
  it("200 + writes storage key + handoverCompletedAt + transition", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "Alice Tradie", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });

    const res = await POST(makeReq(), routeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.storageKey).toBe(
      "handovers/org_1/ins_1/handover-package.zip",
    );
    expect(body.data.packageUrl).toBe(
      "https://signed.example/handover.zip",
    );

    // CAS guard — only stamps the timestamp + key when the row is still
    // CLOSED + handover not already recorded. A duplicate POST that races
    // would miss the CAS predicate and return 0 → 409.
    expect(inspectionUpdateMany).toHaveBeenCalledTimes(1);
    const casCall = inspectionUpdateMany.mock.calls[0][0];
    expect(casCall.where.status).toBe("CLOSED");
    expect(casCall.where.handoverCompletedAt).toBeNull();
    expect(casCall.data.handoverPackageStorageKey).toBe(
      "handovers/org_1/ins_1/handover-package.zip",
    );
    expect(casCall.data.handoverCompletedAt).toBeInstanceOf(Date);

    // Audit transition written with the SP-J transition key.
    expect(writeLifecycleTransition).toHaveBeenCalledTimes(1);
    const txArgs = writeLifecycleTransition.mock.calls[0][0];
    expect(txArgs.transitionKey).toBe("complete_handover");
    expect(txArgs.auditAction).toBe("JOB_HANDED_OVER");

    expect(exportHandoverPackageToBYOKStorage).toHaveBeenCalledWith("ins_1");
  });

  it("409 status_drift when CAS finds row already handed over (race)", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    inspectionUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.missing).toContain("status_drift");
  });

  it("500 when storage export throws (hard failure — not fire-and-forget)", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", name: "A", role: "USER" },
    });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    exportHandoverPackageToBYOKStorage.mockRejectedValueOnce(
      new Error("supabase down"),
    );

    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
  });
});
