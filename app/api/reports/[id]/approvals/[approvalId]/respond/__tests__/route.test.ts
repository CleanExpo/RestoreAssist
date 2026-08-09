import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const approvalUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    reportApproval: {
      update: (...args: unknown[]) => approvalUpdate(...args),
    },
  },
}));

import { POST } from "../route";

const request = new NextRequest(
  "http://localhost/api/reports/report_1/approvals/approval_1/respond",
  {
    method: "POST",
    body: JSON.stringify({ status: "APPROVED" }),
    headers: { "content-type": "application/json" },
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "contractor_1" } });
});

describe("POST /api/reports/[id]/approvals/[approvalId]/respond", () => {
  it("requires contractor authentication", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("rejects contractor-authored client approval decisions without mutating", async () => {
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toMatch(/client portal/i);
    expect(approvalUpdate).not.toHaveBeenCalled();
  });
});
