import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email/resolve-platform-config", () => ({
  isEmailServiceConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/evidence/submission-gate", () => ({
  validateSubmission: vi.fn(async () => ({
    passed: false,
    gaps: [{ evidenceClass: "PHOTO" }],
    completionPercentage: 50,
    totalRequired: 2,
    totalCaptured: 1,
    warnings: [],
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    auditLog: { findFirst: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  auditLog: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "u1" } });
  p.inspection.findUnique.mockResolvedValue({
    reportId: "rep1",
    claimType: "WATER_DAMAGE",
    clientId: "c1",
    client: { email: "client@test.com" },
    report: { id: "rep1", status: "COMPLETED", client: null },
  });
  p.auditLog.findFirst.mockResolvedValue(null);
});

describe("GET /api/inspections/[id]/comms-readiness", () => {
  it("returns email and completeness signals", async () => {
    p.auditLog.findFirst
      .mockResolvedValueOnce({ timestamp: new Date("2026-06-01T12:00:00Z") })
      .mockResolvedValueOnce(null);

    const res = await GET(
      new NextRequest("http://localhost/api/inspections/i1/comms-readiness"),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientHasEmail).toBe(true);
    expect(body.data.reportPdfReady).toBe(true);
    expect(body.data.completenessBlockerCount).toBe(1);
    expect(body.data.reportDeliveredAt).toBeTruthy();
  });
});
