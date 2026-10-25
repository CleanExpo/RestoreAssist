import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const appointmentCreate = vi.fn();
const resolveInspectionWrite = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    jobAppointment: { create: (...a: unknown[]) => appointmentCreate(...a) },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));

import { POST } from "../route";

const params = { params: Promise.resolve({ id: "insp1" }) };
const req = () =>
  new NextRequest("http://localhost/api/inspections/insp1/appointments", {
    method: "POST",
    body: JSON.stringify({
      startsAt: "2026-10-27T09:00:00Z",
      endsAt: "2026-10-27T11:00:00Z",
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resolveInspectionWrite.mockResolvedValue({ ok: true, data: {} });
  appointmentCreate.mockResolvedValue({ id: "ap1" });
});

// RA-8065: a demoted manager keeps role MANAGER in the login cookie.
describe("POST /api/inspections/[id]/appointments — role gate", () => {
  it("returns 403 when the cookie says MANAGER but the database says USER", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({ role: "USER" });
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "ADMIN"])(
    "creates the visit when the database role is %s",
    async (dbRole) => {
      getServerSession.mockResolvedValue({ user: { id: "u1", role: dbRole } });
      userFindUnique.mockResolvedValue({ role: dbRole });
      const res = await POST(req(), params);
      expect(res.status).toBe(201);
      expect(appointmentCreate).toHaveBeenCalledTimes(1);
    },
  );
});
