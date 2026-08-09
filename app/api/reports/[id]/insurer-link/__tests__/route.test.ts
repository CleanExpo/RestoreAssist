import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const reportFindFirst = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => auditLogCreate(...args),
    },
  },
}));
vi.mock("@/lib/portal-token", () => ({
  generateInsurerToken: () => "signed-token",
}));

import { POST } from "../route";

const request = new NextRequest(
  "http://localhost/api/reports/report_1/insurer-link",
  { method: "POST" },
);
const params = { params: Promise.resolve({ id: "report_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  auditLogCreate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "manager_1" } });
  reportFindFirst.mockResolvedValue({
    id: "report_1",
    reportNumber: "NIR-001",
    propertyAddress: "1 Test Street",
    status: "COMPLETED",
    inspection: { id: "inspection_1" },
  });
  auditLogCreate.mockResolvedValue({ id: "audit_1", timestamp: new Date() });
});

describe("POST /api/reports/[id]/insurer-link — link-generation evidence", () => {
  it("records link generation without claiming the report was delivered", async () => {
    const response = await POST(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deliveryRecorded).toBe(false);
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "inspection_1",
        userId: "manager_1",
        action: "REPORT_INSURER_LINK_GENERATED",
        entityType: "Report",
        entityId: "report_1",
        changes: expect.stringContaining('"deliveryStatus":"not_sent"'),
      }),
      select: { id: true, timestamp: true },
    });
    expect(auditLogCreate).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "REPORT_SENT" }),
      select: expect.anything(),
    });
    expect(auditLogCreate).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "REPORT_DELIVERED" }),
      select: expect.anything(),
    });
  });

  it("does not generate a link for a report that is not final", async () => {
    reportFindFirst.mockResolvedValueOnce({
      id: "report_1",
      reportNumber: "NIR-001",
      propertyAddress: "1 Test Street",
      status: "APPROVED",
      inspection: { id: "inspection_1" },
    });

    const response = await POST(request, params);

    expect(response.status).toBe(409);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("does not generate a link for an unrelated or inaccessible report", async () => {
    reportFindFirst.mockResolvedValueOnce(null);

    const response = await POST(request, params);

    expect(response.status).toBe(404);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("does not return a link when generation evidence persistence fails", async () => {
    auditLogCreate.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request, params);

    expect(response.status).toBe(500);
  });
});
