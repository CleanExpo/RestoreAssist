/**
 * RA-8497: booking a site visit with a technician notice.
 *
 * - The office types a date and times; the route reads them in the
 *   organisation's timezone (never the browser's or the server's).
 * - An assignee must belong to the caller's organisation AND be able to open
 *   the job, so a notice never goes to someone outside the business or to a
 *   colleague who would land on a 404.
 * - A valid assignee gets the notice scheduled under after(); the 201 never
 *   waits on email, and a refused booking schedules nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

const mockAfter = vi.fn();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => mockAfter(task),
}));

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockResolveInspectionWrite = vi.fn();
const mockAssertInspectionReadable = vi.fn();
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: (...a: unknown[]) => mockResolveInspectionWrite(...a),
  assertInspectionReadable: (...a: unknown[]) =>
    mockAssertInspectionReadable(...a),
}));

const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockOrgFindUnique = vi.fn();
const mockAppointmentCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      findFirst: (...a: unknown[]) => mockUserFindFirst(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
    },
    jobAppointment: {
      create: (...a: unknown[]) => mockAppointmentCreate(...a),
    },
  },
}));

const mockNotify = vi.fn();
vi.mock("@/lib/scheduling/appointment-notice", () => ({
  notifyTechnicianOfBooking: (...a: unknown[]) => mockNotify(...a),
}));

import { POST } from "../route";

const params = { params: Promise.resolve({ id: "insp-1" }) };

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/inspections/insp-1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params,
  );
}

const booking = {
  title: "Re-attendance",
  date: "2026-01-15",
  startTime: "09:00",
  endTime: "11:00",
  notes: "Ring the insured before arriving.",
  assignedUserId: "tech-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { id: "manager-1", role: "MANAGER" },
  });
  mockResolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: { id: "insp-1" },
  });
  mockUserFindUnique.mockResolvedValue({ organizationId: "org-1" });
  mockOrgFindUnique.mockResolvedValue({ timezone: "Australia/Sydney" });
  mockUserFindFirst.mockResolvedValue({ id: "tech-1" });
  mockAssertInspectionReadable.mockResolvedValue({
    ok: true,
    data: { id: "insp-1", userId: "owner-1", workspaceId: null },
  });
  mockAppointmentCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "appt-1",
      ...data,
    }),
  );
  mockNotify.mockResolvedValue(undefined);
});

describe("POST /api/inspections/[id]/appointments (RA-8497)", () => {
  it("stores a typed date and times as instants in the organisation's timezone", async () => {
    const res = await post(booking);
    expect(res.status).toBe(201);
    const { data } = mockAppointmentCreate.mock.calls[0][0];
    expect((data.startsAt as Date).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect((data.endsAt as Date).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(data.notes).toBe("Ring the insured before arriving.");
    expect(data.assignedUserId).toBe("tech-1");
    expect(data.title).toBe("Re-attendance");
  });

  it("reads the same typed times in Perth for a Perth organisation", async () => {
    mockOrgFindUnique.mockResolvedValue({ timezone: "Australia/Perth" });
    await post(booking);
    const { data } = mockAppointmentCreate.mock.calls[0][0];
    expect((data.startsAt as Date).toISOString()).toBe("2026-01-15T01:00:00.000Z");
  });

  it("refuses typed times that end before they start", async () => {
    const res = await post({ ...booking, startTime: "11:00", endTime: "09:00" });
    await expectRefused(res, 400, /end after it starts/);
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("refuses a malformed typed date", async () => {
    const res = await post({ ...booking, date: "15/01/2026" });
    await expectRefused(res, 400, /date and times/);
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it("refuses an assignee outside the caller's organisation, with no row and no notice", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const res = await post({ ...booking, assignedUserId: "outsider-9" });
    await expectRefused(res, 400, /Choose a technician from your team/);
    expect(mockUserFindFirst.mock.calls[0][0].where).toEqual({
      id: "outsider-9",
      organizationId: "org-1",
    });
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("refuses an assignee when the caller has no organisation", async () => {
    mockUserFindUnique.mockResolvedValue({ organizationId: null });
    const res = await post(booking);
    await expectRefused(res, 400, /Choose a technician from your team/);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it("refuses a colleague who cannot open the job, so no notice links to a 404", async () => {
    mockAssertInspectionReadable.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await post(booking);
    await expectRefused(res, 400, /Choose a technician from your team/);
    // Checked as the assignee, not as the caller.
    expect(mockAssertInspectionReadable).toHaveBeenCalledWith(
      { user: { id: "tech-1" } },
      "insp-1",
    );
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("schedules the technician's notice under after(), once, for the new booking", async () => {
    let release: () => void = () => {};
    mockNotify.mockReturnValue(new Promise<void>((r) => (release = r)));
    const res = await post(booking);
    // The 201 does not wait for the notice.
    expect(res.status).toBe(201);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({ appointmentId: "appt-1" });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    release();
  });

  it("a failing notice does not change the 201", async () => {
    mockNotify.mockRejectedValue(new Error("mail down"));
    const res = await post(booking);
    expect(res.status).toBe(201);
  });

  it("schedules nothing for a booking with no technician", async () => {
    const res = await post({ ...booking, assignedUserId: undefined });
    expect(res.status).toBe(201);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("still accepts startsAt and endsAt instants from older callers", async () => {
    const res = await post({
      startsAt: "2026-01-14T22:00:00.000Z",
      endsAt: "2026-01-15T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
    const { data } = mockAppointmentCreate.mock.calls[0][0];
    expect((data.startsAt as Date).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(data.title).toBe("Site visit");
  });

  it("refuses a JSON body that is not an object as a bad request, not a crash", async () => {
    for (const raw of ['"2026-01-15"', "[1,2]", "null"]) {
      const res = await POST(
        new NextRequest("http://localhost/api/inspections/insp-1/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw,
        }),
        params,
      );
      await expectRefused(res, 400, /startsAt and endsAt required/);
    }
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });

  it("refuses a technician role", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "tech-1", role: "USER" },
    });
    const res = await post(booking);
    await expectRefused(res, 403, /Only managers or owners may schedule visits/);
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
  });
});
