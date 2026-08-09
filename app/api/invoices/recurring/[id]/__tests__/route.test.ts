import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const recurringInvoiceUpdateMany = vi.fn();
const recurringInvoiceFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringInvoice: {
      updateMany: (...args: unknown[]) => recurringInvoiceUpdateMany(...args),
      findFirst: (...args: unknown[]) => recurringInvoiceFindFirst(...args),
    },
  },
}));

import { PATCH } from "../route";

const params = { params: Promise.resolve({ id: "recurring_1" }) };

function request(status: unknown) {
  return new NextRequest(
    "http://localhost/api/invoices/recurring/recurring_1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  recurringInvoiceUpdateMany.mockResolvedValue({ count: 1 });
  recurringInvoiceFindFirst.mockResolvedValue({
    id: "recurring_1",
    status: "ACTIVE",
    pausedAt: null,
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
  });
});

describe("PATCH /api/invoices/recurring/[id]", () => {
  it("pauses an owned schedule and records pausedAt", async () => {
    recurringInvoiceFindFirst.mockResolvedValueOnce({
      id: "recurring_1",
      status: "PAUSED",
      pausedAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    });

    const response = await PATCH(request("PAUSED"), params);

    expect(response.status).toBe(200);
    expect(recurringInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "recurring_1", userId: "user_1" },
      data: { status: "PAUSED", pausedAt: expect.any(Date) },
    });
  });

  it("resumes an owned schedule and clears pausedAt", async () => {
    const response = await PATCH(request("ACTIVE"), params);

    expect(response.status).toBe(200);
    expect(recurringInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "recurring_1", userId: "user_1" },
      data: { status: "ACTIVE", pausedAt: null },
    });
  });

  it("cancels an owned schedule and clears pausedAt", async () => {
    recurringInvoiceFindFirst.mockResolvedValueOnce({
      id: "recurring_1",
      status: "CANCELLED",
      pausedAt: null,
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    });

    const response = await PATCH(request("CANCELLED"), params);

    expect(response.status).toBe(200);
    expect(recurringInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "recurring_1", userId: "user_1" },
      data: { status: "CANCELLED", pausedAt: null },
    });
  });

  it("rejects statuses outside the mutable allowlist", async () => {
    const response = await PATCH(request("COMPLETED"), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION",
        message: "status must be one of ACTIVE, PAUSED, CANCELLED",
      },
    });
    expect(recurringInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const response = await PATCH(request("PAUSED"), params);

    expect(response.status).toBe(401);
    expect(recurringInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["does not exist", "belongs to another user"])(
    "returns 404 when the schedule %s",
    async () => {
      recurringInvoiceUpdateMany.mockResolvedValueOnce({ count: 0 });

      const response = await PATCH(request("PAUSED"), params);

      expect(response.status).toBe(404);
      expect(recurringInvoiceUpdateMany).toHaveBeenCalledWith({
        where: { id: "recurring_1", userId: "user_1" },
        data: { status: "PAUSED", pausedAt: expect.any(Date) },
      });
      expect(recurringInvoiceFindFirst).not.toHaveBeenCalled();
    },
  );

  it("returns a generic 500 response when the update fails", async () => {
    recurringInvoiceUpdateMany.mockRejectedValueOnce(
      new Error("private database detail"),
    );

    const response = await PATCH(request("PAUSED"), params);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL",
      message: "Internal server error",
    });
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });
});
