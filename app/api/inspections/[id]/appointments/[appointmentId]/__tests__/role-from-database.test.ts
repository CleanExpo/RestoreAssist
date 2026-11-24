/**
 * RA-8065: only managers and owners may cancel a visit. The role in the login
 * cookie is only refreshed on sign-in, so a manager demoted to technician
 * keeps a MANAGER cookie for up to 90 days. The route must read the role from
 * the database, not from the session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { id: "insp-1" } }),
  assertInspectionAssignedWrite: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { id: "insp-1" } }),
}));

const mockUserFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    jobAppointment: {
      findFirst: vi.fn().mockResolvedValue({
        id: "appt-1",
        status: "SCHEDULED",
        assignedUserId: "tech-1",
      }),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "appt-1", status: "CANCELLED" }),
      update: vi.fn(),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}));

vi.mock("@/lib/scheduling/appointment-notice", () => ({
  notifyTechnicianOfCancellation: vi.fn(),
}));

import { PATCH } from "../route";

function cancel() {
  return PATCH(
    new NextRequest(
      "http://localhost/api/inspections/insp-1/appointments/appt-1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      },
    ),
    { params: Promise.resolve({ id: "insp-1", appointmentId: "appt-1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { id: "user-m", role: "MANAGER" },
  });
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH cancel /api/inspections/[id]/appointments/[appointmentId] role (RA-8065)", () => {
  it("refuses a demoted manager whose cookie still says MANAGER", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "USER" });
    const res = await cancel();
    await expectRefused(res, 403, /Only managers or owners may cancel visits/);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a demoted owner whose cookie still says ADMIN", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-m", role: "ADMIN" },
    });
    mockUserFindUnique.mockResolvedValue({ role: "USER" });
    const res = await cancel();
    await expectRefused(res, 403, /Only managers or owners may cancel visits/);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "ADMIN"])(
    "cancels the visit when the database role is %s",
    async (role) => {
      mockUserFindUnique.mockResolvedValue({ role });
      const res = await cancel();
      expect(res.status).toBe(200);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    },
  );
});
