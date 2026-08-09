import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientPortalAccount: { findUnique: vi.fn(), update: vi.fn() },
    inspection: { findFirst: vi.fn(), findUnique: vi.fn() },
    moistureReading: { count: vi.fn(), aggregate: vi.fn() },
    affectedArea: { count: vi.fn(), aggregate: vi.fn() },
    scopeItem: { count: vi.fn() },
  },
}));

import { generatePortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const p = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;
const originalPortalSecret = process.env.PORTAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTAL_SECRET = "test-portal-secret";
  p.clientPortalAccount.findUnique.mockResolvedValue({
    id: "portal_1",
    clientId: "client_1",
    expiresAt: new Date("2099-08-01T00:00:00.000Z"),
    revokedAt: null,
  });
  p.clientPortalAccount.update.mockResolvedValue({});
  p.inspection.findFirst.mockResolvedValue({ id: "inspection_1" });
  p.inspection.findUnique.mockResolvedValue({
    inspectionNumber: "RA-MOCK-001",
    propertyAddress: "12 Mock Street, Brisbane QLD",
    propertyPostcode: "4000",
    technicianName: "Mock Technician",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    status: "COMPLETED",
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    environmentalData: [],
    classifications: [],
    report: { id: "report_1", status: "COMPLETED" },
  });
  p.moistureReading.count.mockResolvedValue(0);
  p.moistureReading.aggregate.mockResolvedValue({
    _avg: { moistureLevel: null },
  });
  p.affectedArea.count.mockResolvedValue(0);
  p.affectedArea.aggregate.mockResolvedValue({
    _sum: { affectedSquareFootage: null },
  });
  p.scopeItem.count.mockResolvedValue(0);
});

afterEach(() => {
  if (originalPortalSecret === undefined) delete process.env.PORTAL_SECRET;
  else process.env.PORTAL_SECRET = originalPortalSecret;
});

describe("GET /api/portal/[token]/pdf", () => {
  it("generates the completed report for an active revocable token", async () => {
    const response = await GET(
      new NextRequest("https://restoreassist.app/api/portal/db-token/pdf"),
      { params: Promise.resolve({ token: "db-token" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(p.inspection.findFirst).toHaveBeenCalledWith({
      where: { report: { clientId: "client_1" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    expect(p.inspection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "inspection_1",
          report: { clientId: "client_1" },
        },
        include: expect.objectContaining({
          moistureReadings: expect.objectContaining({ take: 20 }),
        }),
      }),
    );
  });

  it("rejects a revoked account even when its token is valid legacy HMAC", async () => {
    const token = generatePortalToken("inspection_legacy");
    p.clientPortalAccount.findUnique.mockResolvedValue({
      id: "portal_1",
      clientId: "client_1",
      expiresAt: new Date("2099-08-01T00:00:00.000Z"),
      revokedAt: new Date("2026-08-02T00:00:00.000Z"),
    });

    const response = await GET(
      new NextRequest(`https://restoreassist.app/api/portal/${token}/pdf`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(401);
    expect(p.inspection.findFirst).not.toHaveBeenCalled();
    expect(p.inspection.findUnique).not.toHaveBeenCalled();
  });
});
