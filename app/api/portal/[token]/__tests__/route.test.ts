import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientPortalAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inspection: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    moistureReading: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
    affectedArea: { count: vi.fn() },
    scopeItem: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { generatePortalToken } from "@/lib/portal-token";
import { applyRateLimit } from "@/lib/rate-limiter";
import { GET } from "../route";

const mApplyRateLimit = applyRateLimit as unknown as ReturnType<typeof vi.fn>;

const p = prisma as unknown as {
  clientPortalAccount: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inspection: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  moistureReading: {
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  affectedArea: { count: ReturnType<typeof vi.fn> };
  scopeItem: { count: ReturnType<typeof vi.fn> };
};

const originalPortalSecret = process.env.PORTAL_SECRET;
const request = new NextRequest(
  "https://restoreassist.app/api/portal/db-portal-token",
);
const params = { params: Promise.resolve({ token: "db-portal-token" }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTAL_SECRET = "test-portal-secret";
  p.clientPortalAccount.findUnique.mockResolvedValue({
    id: "portal_1",
    clientId: "client_1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    tokenRotatedAt: null,
    revokedAt: null,
    expiresAt: new Date("2099-08-01T00:00:00.000Z"),
  });
  p.clientPortalAccount.update.mockResolvedValue({});
  p.inspection.findFirst.mockResolvedValue({ id: "inspection_1" });
  p.inspection.findUnique.mockResolvedValue({
    inspectionNumber: "RA-MOCK-001",
    propertyAddress: "12 Mock Street, Brisbane QLD",
    technicianName: "Mock Technician",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    status: "IN_PROGRESS",
    affectedAreas: [],
    scopeItems: [],
    report: { id: "report_1", status: "DRAFT" },
  });
  p.moistureReading.count.mockResolvedValue(0);
  p.moistureReading.aggregate.mockResolvedValue({
    _avg: { moistureLevel: null },
  });
  p.moistureReading.findFirst.mockResolvedValue(null);
  p.affectedArea.count.mockResolvedValue(0);
  p.scopeItem.count.mockResolvedValue(0);
});

afterEach(() => {
  if (originalPortalSecret === undefined) {
    delete process.env.PORTAL_SECRET;
  } else {
    process.env.PORTAL_SECRET = originalPortalSecret;
  }
});

describe("GET /api/portal/[token]", () => {
  it("returns the client-scoped claim for an active revocable portal token", async () => {
    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      inspectionNumber: "RA-MOCK-001",
      propertyAddress: "12 Mock Street, Brisbane QLD",
      moistureSummary: { readingCount: 0, latestDate: null },
    });
    expect(body.moistureSummary).not.toHaveProperty("avgMoisture");
    expect(p.moistureReading.aggregate).not.toHaveBeenCalled();
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
      }),
    );
    expect(mApplyRateLimit).toHaveBeenCalledWith(request, {
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-token",
      failClosedOnUpstashError: true,
    });
  });

  it("does not fall back to HMAC when the matching account is revoked", async () => {
    const token = generatePortalToken("inspection_legacy");
    p.clientPortalAccount.findUnique.mockResolvedValue({
      id: "portal_1",
      clientId: "client_1",
      expiresAt: new Date("2099-08-01T00:00:00.000Z"),
      revokedAt: new Date("2026-08-02T00:00:00.000Z"),
    });

    const response = await GET(
      new NextRequest(`https://restoreassist.app/api/portal/${token}`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(401);
    expect(p.inspection.findFirst).not.toHaveBeenCalled();
    expect(p.inspection.findUnique).not.toHaveBeenCalled();
  });

  it("keeps an unexpired legacy HMAC link read-only and inspection-scoped", async () => {
    const token = generatePortalToken("inspection_legacy");
    p.clientPortalAccount.findUnique.mockResolvedValue(null);

    const response = await GET(
      new NextRequest(`https://restoreassist.app/api/portal/${token}`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(200);
    expect(p.inspection.findFirst).not.toHaveBeenCalled();
    expect(p.inspection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inspection_legacy" } }),
    );
  });
});
