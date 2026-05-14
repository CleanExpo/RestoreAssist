import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionUpdateMany = vi.fn();
const inspectionFindFirst = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      updateMany: (...a: unknown[]) => inspectionUpdateMany(...a),
      findFirst: (...a: unknown[]) => inspectionFindFirst(...a),
    },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

// Import after mocks
import { POST } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp_1/accept", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "insp_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  inspectionUpdateMany.mockReset();
  inspectionFindFirst.mockReset();
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({ id: "audit_1" });
});

describe("POST /api/inspections/[id]/accept", () => {
  it("401 when no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(401);
  });

  it("accepts a DR_NRPG inspection: sets acceptedAt, flips DRAFT→PROCESSING, writes AuditLog", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "user_1", role: "USER" },
    });
    inspectionUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makeRequest(), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("PROCESSING");
    expect(body.acceptedAt).toBeTruthy();

    // CAS guard: only flip if acceptedAt is still null
    expect(inspectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "insp_1",
          userId: "user_1",
        }),
        data: expect.objectContaining({
          status: "PROCESSING",
        }),
      }),
    );

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "insp_1",
          userId: "user_1",
          action: "DR_NRPG_INSPECTION_ACCEPTED",
        }),
      }),
    );
  });

  it("409 when inspection already accepted (CAS fails) and row exists", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "user_1", role: "USER" },
    });
    inspectionUpdateMany.mockResolvedValueOnce({ count: 0 });
    inspectionFindFirst.mockResolvedValueOnce({ id: "insp_1" });

    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(409);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("404 when inspection does not exist for this user", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "user_1", role: "USER" },
    });
    inspectionUpdateMany.mockResolvedValueOnce({ count: 0 });
    inspectionFindFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(404);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
