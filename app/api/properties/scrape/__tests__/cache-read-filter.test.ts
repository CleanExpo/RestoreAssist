/**
 * RA-1761 — regression test for the cache read filter.
 *
 * The scrape route's write path (POST handler tail) persists rows for both
 * `dataSource: "onthehouse"` and `dataSource: "domain"` with a 90-day TTL.
 * The read path used to filter to `dataSource: "onthehouse"` only, so cached
 * domain.com.au rows were stranded — every repeat domain lookup hit the
 * upstream scraper unnecessarily.
 *
 * These tests exercise the read filter in isolation. They mock the route's
 * collaborators so the test stops at the cache-hit return and never touches
 * the live scraper.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null), // never rate-limited
}));

vi.mock("@/lib/idempotency", () => ({
  // Bypass — invoke the inner callback with the raw request body verbatim.
  withIdempotency: vi.fn(
    async (
      req: Request,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => {
      const raw = await req.text();
      return fn(raw);
    },
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // PR5: the route now gates on the caller's subscription tier before the
    // cache read — mock an entitled (Premium) user so these cache tests run.
    user: { findUnique: vi.fn() },
    propertyLookup: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockFindFirst = (
  prisma as unknown as {
    propertyLookup: {
      findFirst: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  }
).propertyLookup.findFirst;
const mockUpsert = (
  prisma as unknown as {
    propertyLookup: {
      findFirst: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  }
).propertyLookup.upsert;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  // PR5 gate: default the caller to an entitled Premium user for these tests.
  (
    prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
  ).user.findUnique.mockResolvedValue({
    id: "u_test",
    subscriptionTier: { tierName: "PREMIUM" },
  });
  // Fail loudly if the test ever falls through to the scraper.
  vi.spyOn(global, "fetch").mockImplementation(async () => {
    throw new Error("fetch should not be called when cache hits");
  });
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/properties/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_DATA = {
  address: "12 SMITH ST, BRISBANE QLD 4000",
  url: "https://www.onthehouse.com.au/property/qld/brisbane-4000/12-smith-st-12345",
  bedrooms: 3,
  bathrooms: 2,
  carSpaces: 1,
  floorAreaM2: 120,
  floorPlanImages: [],
  propertyImages: [],
  scrapedAt: new Date().toISOString(),
  confidence: "high" as const,
};

describe("RA-1761 — cache read filter widened to include domain.com.au", () => {
  it("serves a cached `onthehouse` row (regression)", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "pl_1",
      propertyAddress: "12 SMITH ST",
      propertyPostcode: "4000",
      dataSource: "onthehouse",
      expiresAt: new Date(Date.now() + 86_400_000),
      propertyData: SAMPLE_DATA,
    });

    const res = await POST(
      makePost({ address: "12 Smith St", postcode: "4000" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: SAMPLE_DATA, cached: true });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("serves a cached `domain` row (the bug RA-1761 fixes)", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "pl_2",
      propertyAddress: "34 OAK AVE",
      propertyPostcode: "2000",
      dataSource: "domain",
      expiresAt: new Date(Date.now() + 86_400_000),
      propertyData: { ...SAMPLE_DATA, address: "34 OAK AVE, SYDNEY NSW 2000" },
    });

    const res = await POST(
      makePost({ address: "34 Oak Ave", postcode: "2000" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.data.address).toBe("34 OAK AVE, SYDNEY NSW 2000");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("findFirst is called with `dataSource: { in: [onthehouse, domain] }`", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "pl_3",
      dataSource: "domain",
      expiresAt: new Date(Date.now() + 86_400_000),
      propertyData: SAMPLE_DATA,
    });

    await POST(makePost({ address: "1 Test St", postcode: "1000" }));

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    const callArg = mockFindFirst.mock.calls[0][0];
    expect(callArg.where.dataSource).toEqual({ in: ["onthehouse", "domain"] });
  });

  it("returns 401 when unauthenticated (no session)", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(
      makePost({ address: "1 Test St", postcode: "1000" }),
    );
    expect(res.status).toBe(401);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
