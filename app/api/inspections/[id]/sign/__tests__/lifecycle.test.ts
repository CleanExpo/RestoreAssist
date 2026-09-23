import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { inspectionUpdateMany, inspectionFindFirst, onNextAction } = vi.hoisted(
  () => ({
    inspectionUpdateMany: vi.fn(),
    inspectionFindFirst: vi.fn(),
    onNextAction: vi.fn(),
  }),
);

const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionTenancy }));
vi.mock("@prisma/client", () => ({
  InspectionStatus: {
    SUBMITTED: "SUBMITTED",
    ESTIMATED: "ESTIMATED",
    COMPLETED: "COMPLETED",
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    fn: (rawBody: string) => Promise<Response>,
  ) => fn(await request.text()),
}));
vi.mock("@/lib/lifecycle/subscribers/next-action", () => ({
  onNextAction: (...args: unknown[]) => onNextAction(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      updateMany: (...args: unknown[]) => inspectionUpdateMany(...args),
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
  },
}));

import { getServerSession } from "next-auth";
import { DELETE, POST } from "../route";

const mockSession = vi.mocked(getServerSession);

describe("inspection sign lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    inspectionUpdateMany.mockResolvedValue({ count: 1 });
    onNextAction.mockResolvedValue(undefined);
  });

  it("only signs completed work and normalises it to SUBMITTED", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/sign", {
        method: "POST",
        body: JSON.stringify({ signatoryName: "Test Technician" }),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(200);
    expect(inspectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "i1",
          userId: "u1",
          signedAt: null,
          status: { in: ["ESTIMATED", "COMPLETED", "SUBMITTED"] },
        }),
        data: expect.objectContaining({ status: "SUBMITTED" }),
      }),
    );
  });

  it("rejects signing before processing reaches a signable state", async () => {
    inspectionUpdateMany.mockResolvedValue({ count: 0 });
    inspectionFindFirst.mockResolvedValue({
      id: "i1",
      status: "DRAFT",
      signedAt: null,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/sign", {
        method: "POST",
        body: JSON.stringify({ signatoryName: "Test Technician" }),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message:
            "Inspection cannot be signed while in DRAFT status. Complete processing first.",
        }),
      }),
    );
    expect(onNextAction).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/inspections/[id]/sign", () => {
  function deleteRequest() {
    return new NextRequest("http://localhost/api/inspections/i1/sign", {
      method: "DELETE",
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "admin-A" } } as never);
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin-A", role: "ADMIN", organizationId: "org-A" },
    });
    assertInspectionTenancy.mockResolvedValue({
      ok: true,
      data: { userId: "admin-A", inspectionId: "i1" },
    });
    inspectionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("refuses an admin outside the inspection's tenancy", async () => {
    assertInspectionTenancy.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(response.status).toBe(404);
    // Clearing a signature destroys ETA-1999 evidence. A gate that returned
    // the right status while still issuing the write would pass a status-only
    // assertion, so assert the write never happened.
    expect(inspectionUpdateMany).not.toHaveBeenCalled();
  });

  it("clears the signature only on the row the tenancy check proved", async () => {
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(response.status).toBe(200);
    expect(inspectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", userId: "admin-A" } }),
    );
  });
});
