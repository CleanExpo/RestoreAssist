/**
 * Closure-gate safeguard guard.
 *
 * COMPLETED is the closure gate's `report_sent` precondition
 * (lib/lifecycle/inspection-state-machine.ts). The bulk-status path performs no
 * delivery, so it must NOT be able to set COMPLETED — otherwise an owner can
 * spoof `report_sent` and close a claim for an undelivered report. Housekeeping
 * statuses stay bulk-settable.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/bulk-operations", () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  validateReportIds: vi.fn(async (ids: string[]) => ids),
  getUnauthorizedReportIds: vi.fn(async () => []),
  validateBatchSize: vi.fn(() => ({ valid: true })),
  isValidReportStatus: vi.fn((s: string) =>
    ["DRAFT", "PENDING", "APPROVED", "COMPLETED", "ARCHIVED"].includes(
      s.toUpperCase(),
    ),
  ),
  createAuditLogEntry: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { updateMany: vi.fn(async () => ({ count: 1 })) },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendReportCompletedEmail: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyReportCompleted: vi.fn() }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, { status }: { status: number }) =>
    new Response(null, { status }),
  fromException: () => new Response(null, { status: 500 }),
}));

import { PATCH } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function makeRequest(status: string) {
  return new NextRequest("http://localhost/api/reports/bulk-status", {
    method: "PATCH",
    body: JSON.stringify({ ids: ["r1"], status }),
  });
}

describe("PATCH /api/reports/bulk-status closure-gate safeguard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
  });

  it("rejects COMPLETED in bulk (would spoof report_sent) without writing", async () => {
    const res = await PATCH(makeRequest("COMPLETED"));
    expect(res.status).toBe(400);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it("rejects COMPLETED case-insensitively", async () => {
    const res = await PATCH(makeRequest("completed"));
    expect(res.status).toBe(400);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it("still allows a housekeeping status (ARCHIVED)", async () => {
    const res = await PATCH(makeRequest("ARCHIVED"));
    expect(res.status).toBe(200);
    expect(prisma.report.updateMany).toHaveBeenCalledTimes(1);
  });
});
