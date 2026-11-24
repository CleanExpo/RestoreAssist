/**
 * RA-8065: only managers and owners may book a visit. The role in the login
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
  assertInspectionReadable: vi.fn().mockResolvedValue({
    ok: true,
    data: { id: "insp-1", userId: "owner-1", workspaceId: null },
  }),
}));

const mockUserFindUnique = vi.fn();
const mockAppointmentCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue({ timezone: "Australia/Sydney" }),
    },
    jobAppointment: {
      create: (...a: unknown[]) => mockAppointmentCreate(...a),
    },
  },
}));

vi.mock("@/lib/scheduling/appointment-notice", () => ({
  notifyTechnicianOfBooking: vi.fn(),
}));

import { POST } from "../route";

function post() {
  return POST(
    new NextRequest("http://localhost/api/inspections/insp-1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Re-attendance",
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "11:00",
      }),
    }),
    { params: Promise.resolve({ id: "insp-1" }) },
  );
}

/** The caller's database row; each read of it returns the same user. */
function dbUser(role: string) {
  mockUserFindUnique.mockResolvedValue({ role, organizationId: "org-1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { id: "user-m", role: "MANAGER" },
  });
  mockAppointmentCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "appt-1",
      ...data,
    }),
  );
});

describe("POST /api/inspections/[id]/appointments role (RA-8065)", () => {
  it("refuses a demoted manager whose cookie still says MANAGER", async () => {
    dbUser("USER");
    const res = await post();
    await expectRefused(res, 403, /Only managers or owners may schedule visits/);
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it("refuses a demoted owner whose cookie still says ADMIN", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-m", role: "ADMIN" },
    });
    dbUser("USER");
    const res = await post();
    await expectRefused(res, 403, /Only managers or owners may schedule visits/);
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "ADMIN"])(
    "books the visit when the database role is %s",
    async (role) => {
      dbUser(role);
      const res = await post();
      expect(res.status).toBe(201);
      expect(mockAppointmentCreate).toHaveBeenCalledTimes(1);
    },
  );
});
