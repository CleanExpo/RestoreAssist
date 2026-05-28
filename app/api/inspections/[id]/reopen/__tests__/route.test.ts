/**
 * POST /api/inspections/[id]/reopen — admin-only un-archive route.
 *
 * Tests pin the RA-4860 contract:
 *   - 401 when no session.
 *   - 403 when the caller is not ADMIN (JWT or DB).
 *   - 422 when `reason` is missing / shorter than 10 chars.
 *   - 404 when the inspection does not exist.
 *   - 409 when the inspection is not CLOSED/ARCHIVED.
 *   - 200 on happy path: status flips CLOSED/ARCHIVED -> IN_BILLING,
 *     completedAt is cleared so the UI no longer renders the locked terminal card,
 *     ProgressTransition + AuditLog are written with reason and previous/new status.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaTx = {
  inspection: {
    updateMany: vi.fn(),
  },
  claimProgress: {
    updateMany: vi.fn(),
  },
};

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn) => fn(prismaTx)),
    inspection: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeLifecycleTransition } from "@/lib/audit/lifecycle-event";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockVerifyAdmin = verifyAdminFromDb as unknown as ReturnType<
  typeof vi.fn
>;
const mockWriteLifecycleTransition =
  writeLifecycleTransition as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  inspection: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/reopen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN = {
  id: "admin_1",
  role: "ADMIN" as const,
  organizationId: "org_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation(async (fn) => fn(prismaTx));
  prismaTx.inspection.updateMany.mockResolvedValue({ count: 1 });
  prismaTx.claimProgress.updateMany.mockResolvedValue({ count: 1 });
  mockWriteLifecycleTransition.mockResolvedValue({
    id: "transition_1",
    auditLogId: "audit_1",
  });
});

describe("POST /api/inspections/[id]/reopen", () => {
  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    mockVerifyAdmin.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }),
    });

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech_1", role: "TECHNICIAN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when JWT role says ADMIN but DB role is no longer ADMIN", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "demoted_1", role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when reason is missing", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });

    const res = await POST(makePost({}), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(res.status).toBe(422);
    expect(prismaTx.inspection.updateMany).not.toHaveBeenCalled();
  });

  it("returns 422 when reason is shorter than 10 characters", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });

    const res = await POST(makePost({ reason: "short" }), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(res.status).toBe(422);
    expect(prismaTx.inspection.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the inspection does not exist", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce(null);

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i_missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the inspection is not CLOSED or ARCHIVED", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "DRAFT",
    });

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(409);
    expect(prismaTx.inspection.updateMany).not.toHaveBeenCalled();
  });

  it("returns 200 on happy path: CLOSED -> IN_BILLING with lifecycle audit", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN", name: "Ada Admin" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "CLOSED",
    });

    const res = await POST(
      makePost({ reason: "Customer dispute - invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        previousStatus: string;
        newStatus: string;
        transitionId: string;
      };
    };
    expect(json.data.previousStatus).toBe("CLOSED");
    expect(json.data.newStatus).toBe("IN_BILLING");
    expect(json.data.transitionId).toBe("transition_1");

    expect(prismaTx.inspection.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", status: "CLOSED" },
      data: { status: "IN_BILLING", completedAt: null },
    });
    expect(mockWriteLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: "i1",
        fromState: "CLOSED",
        toState: "INVOICE_ISSUED",
        transitionKey: "reopen_job",
        actorUserId: ADMIN.id,
        actorRole: ADMIN.role,
        actorName: "Ada Admin",
        auditAction: "INSPECTION_REOPENED",
        auditChanges: expect.objectContaining({
          reason: "Customer dispute - invoice reversed by finance",
          previousInspectionStatus: "CLOSED",
          newInspectionStatus: "IN_BILLING",
        }),
        prismaTx,
      }),
    );
    expect(prismaTx.claimProgress.updateMany).toHaveBeenCalledWith({
      where: { inspectionId: "i1" },
      data: {
        previousState: "CLOSED",
        currentState: "INVOICE_ISSUED",
        closedAt: null,
      },
    });
  });

  it("returns 200 when reopening an ARCHIVED inspection", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "ARCHIVED",
    });

    const res = await POST(
      makePost({ reason: "Audit-finding overturned on appeal - RA-4860" }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { previousStatus: string; newStatus: string };
    };
    expect(json.data.previousStatus).toBe("ARCHIVED");
    expect(json.data.newStatus).toBe("IN_BILLING");
  });

  it("returns 409 when status drifts before the CAS update", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "CLOSED",
    });
    prismaTx.inspection.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      makePost({ reason: "Audit-finding overturned on appeal - RA-4860" }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(409);
    expect(mockWriteLifecycleTransition).not.toHaveBeenCalled();
  });
});
