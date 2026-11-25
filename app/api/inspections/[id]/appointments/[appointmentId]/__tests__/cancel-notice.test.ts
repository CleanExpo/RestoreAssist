/**
 * RA-8525: cancelling a booked visit tells the technician and takes the visit
 * out of their calendar.
 *
 * - Only the request that moves the visit to CANCELLED schedules the notice,
 *   so a repeated or concurrent cancel tells nobody twice.
 * - The notice starts inside after(), never before it, so the response never
 *   waits on email.
 * - Acknowledging a visit sends no cancellation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { id: "insp-1" } }),
  assertInspectionAssignedWrite: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { id: "insp-1" } }),
}));

const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobAppointment: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}));

const mockNotifyCancel = vi.fn();
vi.mock("@/lib/scheduling/appointment-notice", () => ({
  notifyTechnicianOfCancellation: (...a: unknown[]) => mockNotifyCancel(...a),
}));

import { PATCH } from "../route";

const params = {
  params: Promise.resolve({ id: "insp-1", appointmentId: "appt-1" }),
};

function patch(action: string) {
  return PATCH(
    new NextRequest(
      "http://localhost/api/inspections/insp-1/appointments/appt-1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    ),
    params,
  );
}

async function runAfterTasks(): Promise<void> {
  for (const [task] of mockAfter.mock.calls) await (task as () => unknown)();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { id: "manager-1", role: "MANAGER" },
  });
  mockFindFirst.mockResolvedValue({
    id: "appt-1",
    status: "SCHEDULED",
    assignedUserId: "tech-1",
  });
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFindUnique.mockResolvedValue({ id: "appt-1", status: "CANCELLED" });
  mockUpdate.mockImplementation(async ({ data }: { data: object }) => ({
    id: "appt-1",
    ...data,
  }));
  mockNotifyCancel.mockResolvedValue(undefined);
});

describe("PATCH cancel (RA-8525)", () => {
  it("cancels and tells the technician once, started inside after()", async () => {
    const res = await patch("cancel");
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("CANCELLED");

    const { where, data } = mockUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "appt-1", status: { not: "CANCELLED" } });
    expect(data.status).toBe("CANCELLED");

    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockNotifyCancel).not.toHaveBeenCalled();
    await runAfterTasks();
    expect(mockNotifyCancel).toHaveBeenCalledTimes(1);
    expect(mockNotifyCancel).toHaveBeenCalledWith({ appointmentId: "appt-1" });
  });

  it("a visit already cancelled tells nobody again", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await patch("cancel");
    expect(res.status).toBe(200);
    await runAfterTasks();
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockNotifyCancel).not.toHaveBeenCalled();
  });

  it("a visit with no technician tells nobody", async () => {
    mockFindFirst.mockResolvedValue({
      id: "appt-1",
      status: "SCHEDULED",
      assignedUserId: null,
    });
    expect((await patch("cancel")).status).toBe(200);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("a failing notice does not fail the cancel", async () => {
    mockNotifyCancel.mockRejectedValue(new Error("mail down"));
    expect((await patch("cancel")).status).toBe(200);
    await expect(runAfterTasks()).resolves.toBeUndefined();
  });

  it("outside a request scope the notice still goes once", async () => {
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });
    expect((await patch("cancel")).status).toBe(200);
    expect(mockNotifyCancel).toHaveBeenCalledTimes(1);
  });

  it("acknowledging sends no cancellation", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "tech-1", role: "USER" },
    });
    const res = await patch("acknowledge");
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("ACKNOWLEDGED");
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockNotifyCancel).not.toHaveBeenCalled();
  });
});
