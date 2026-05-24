/**
 * POST /api/inspections/[id]/reopen — admin-only un-archive route.
 *
 * Verified P0 #2 (punch-list 2026-05-15): without this endpoint admins
 * cannot reverse a wrongly-closed inspection without manual DB writes.
 *
 * Tests pin the contract:
 *   - 401 when no session.
 *   - 403 when the caller is not ADMIN (JWT or DB).
 *   - 400 when `reason` is missing / shorter than 10 chars.
 *   - 404 when the inspection does not exist.
 *   - 409 when the inspection is not in a terminal state (DRAFT/SUBMITTED/etc).
 *   - 200 on happy path: status flips COMPLETED → ESTIMATED, AuditLog
 *     row written with reason + previous/new status.
 *
 * `verifyAdminFromDb` (lib/admin-auth.ts) is the gate per CLAUDE.md rule
 * #3 — JWT role can be stale, must re-check against DB.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockVerifyAdmin = verifyAdminFromDb as unknown as ReturnType<
  typeof vi.fn
>;
const p = prisma as unknown as {
  inspection: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
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
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
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
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when JWT role says ADMIN but DB role is no longer ADMIN (stale-claim defence)", async () => {
    // Simulates a demoted admin whose JWT still carries role=ADMIN. The
    // DB re-check inside verifyAdminFromDb catches this and returns 403.
    mockSession.mockResolvedValueOnce({
      user: { id: "demoted_1", role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const res = await POST(
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when reason is missing", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });

    const res = await POST(makePost({}), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(res.status).toBe(400);
    expect(p.inspection.update).not.toHaveBeenCalled();
  });

  it("returns 400 when reason is shorter than 10 characters", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });

    const res = await POST(makePost({ reason: "short" }), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(res.status).toBe(400);
    expect(p.inspection.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the inspection does not exist", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce(null);

    const res = await POST(
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i_missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the inspection is not in a terminal state", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "DRAFT",
    });

    const res = await POST(
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(409);
    expect(p.inspection.update).not.toHaveBeenCalled();
  });

  it("returns 200 on happy path — flips COMPLETED → ESTIMATED and writes AuditLog", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "COMPLETED",
    });
    p.inspection.update.mockResolvedValueOnce({
      id: "i1",
      status: "ESTIMATED",
    });
    p.auditLog.create.mockResolvedValueOnce({ id: "a1" });

    const res = await POST(
      makePost({ reason: "Customer dispute — invoice reversed by finance" }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { previousStatus: string; newStatus: string };
    };
    expect(json.data.previousStatus).toBe("COMPLETED");
    expect(json.data.newStatus).toBe("ESTIMATED");

    expect(p.inspection.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { status: "ESTIMATED" },
    });
    expect(p.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = p.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.inspectionId).toBe("i1");
    expect(auditCall.data.userId).toBe(ADMIN.id);
    expect(auditCall.data.action).toBe("JOB_REOPENED");
    expect(auditCall.data.previousValue).toBe("COMPLETED");
    expect(auditCall.data.newValue).toBe("ESTIMATED");
    // Reason must be embedded forensically (CLAUDE.md rule #4)
    expect(auditCall.data.changes).toContain(
      "Customer dispute — invoice reversed by finance",
    );
  });

  it("returns 200 when reopening a REJECTED inspection (also terminal)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: ADMIN.id, role: "ADMIN" },
    });
    mockVerifyAdmin.mockResolvedValueOnce({ user: ADMIN });
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "REJECTED",
    });
    p.inspection.update.mockResolvedValueOnce({
      id: "i1",
      status: "ESTIMATED",
    });
    p.auditLog.create.mockResolvedValueOnce({ id: "a2" });

    const res = await POST(
      makePost({ reason: "Audit-finding overturned on appeal — RA-XXX" }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { previousStatus: string; newStatus: string };
    };
    expect(json.data.previousStatus).toBe("REJECTED");
    expect(json.data.newStatus).toBe("ESTIMATED");
  });
});
