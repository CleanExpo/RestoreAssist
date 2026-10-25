import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const appointmentFindFirst = vi.fn();
const appointmentUpdate = vi.fn();
const resolveInspectionWrite = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    jobAppointment: {
      findFirst: (...a: unknown[]) => appointmentFindFirst(...a),
      update: (...a: unknown[]) => appointmentUpdate(...a),
    },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: vi.fn(),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));

import { PATCH } from "../route";

const params = {
  params: Promise.resolve({ id: "insp1", appointmentId: "ap1" }),
};
const cancelReq = () =>
  new NextRequest("http://localhost/api/inspections/insp1/appointments/ap1", {
    method: "PATCH",
    body: JSON.stringify({ action: "cancel" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resolveInspectionWrite.mockResolvedValue({ ok: true, data: {} });
  appointmentFindFirst.mockResolvedValue({
    id: "ap1",
    status: "SCHEDULED",
    assignedUserId: null,
  });
  appointmentUpdate.mockResolvedValue({ id: "ap1", status: "CANCELLED" });
});

// RA-8065: a demoted manager keeps role MANAGER in the login cookie.
describe("PATCH /api/inspections/[id]/appointments/[appointmentId] cancel — role gate", () => {
  it("returns 403 when the cookie says MANAGER but the database says USER", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({ role: "USER" });
    const res = await PATCH(cancelReq(), params);
    expect(res.status).toBe(403);
    expect(appointmentUpdate).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "ADMIN"])(
    "cancels the visit when the database role is %s",
    async (dbRole) => {
      getServerSession.mockResolvedValue({ user: { id: "u1", role: dbRole } });
      userFindUnique.mockResolvedValue({ role: dbRole });
      const res = await PATCH(cancelReq(), params);
      expect(res.status).toBe(200);
      expect(appointmentUpdate).toHaveBeenCalledTimes(1);
    },
  );
});
