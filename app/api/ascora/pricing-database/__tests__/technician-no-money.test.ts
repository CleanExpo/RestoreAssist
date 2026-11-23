/**
 * RA-8602: the shared AU scope pricing table holds average, median, min and
 * max unit prices. A technician (USER inside a business) must not read it and
 * must not change its acceptance counts. The real money owner
 * (`lib/auth/redact-money.ts`) runs here; only the database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const {
  userFindUnique,
  pricingFindMany,
  pricingCount,
  pricingFindUnique,
  pricingUpdate,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  pricingFindMany: vi.fn(),
  pricingCount: vi.fn(),
  pricingFindUnique: vi.fn(),
  pricingUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    scopePricingDatabase: {
      findMany: pricingFindMany,
      count: pricingCount,
      findUnique: pricingFindUnique,
      update: pricingUpdate,
    },
  },
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

function userRow(role: string) {
  return {
    role,
    organizationId: "org_1",
    organizationLeftAt: null,
    organizationLeftId: null,
    organization: { ownerId: "owner_1" },
  };
}

const getReq = () =>
  new NextRequest("http://localhost/api/ascora/pricing-database?limit=10");
const postReq = () =>
  new NextRequest("http://localhost/api/ascora/pricing-database", {
    method: "POST",
    body: JSON.stringify({ partNumber: "P-1", accepted: true }),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_tech" } });
  pricingFindMany.mockResolvedValue([
    { partNumber: "P-1", averageUnitPriceAU: 4242, medianUnitPriceAU: 4040 },
  ]);
  pricingCount.mockResolvedValue(1);
  pricingFindUnique.mockResolvedValue({
    partNumber: "P-1",
    acceptedCount: 1,
    rejectedCount: 0,
  });
  pricingUpdate.mockResolvedValue({ partNumber: "P-1" });
});

describe("/api/ascora/pricing-database for a technician", () => {
  it("GET refuses a USER inside a business with 403 and reads no prices", async () => {
    userFindUnique.mockResolvedValue(userRow("USER"));
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(pricingFindMany).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toContain("4242");
  });

  it("POST refuses a USER inside a business with 403 and writes nothing", async () => {
    userFindUnique.mockResolvedValue(userRow("USER"));
    const res = await POST(postReq());
    expect(res.status).toBe(403);
    expect(pricingFindUnique).not.toHaveBeenCalled();
    expect(pricingUpdate).not.toHaveBeenCalled();
  });

  it("GET still answers a MANAGER (positive control)", async () => {
    userFindUnique.mockResolvedValue(userRow("MANAGER"));
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(pricingFindMany).toHaveBeenCalledTimes(1);
  });

  it("POST still records for an ADMIN (positive control)", async () => {
    userFindUnique.mockResolvedValue(userRow("ADMIN"));
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(pricingUpdate).toHaveBeenCalledTimes(1);
  });

  it("GET without a session is 401", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });
});
