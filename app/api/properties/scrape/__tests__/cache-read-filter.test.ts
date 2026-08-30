/** Global address/postcode caching is disabled because a caller-controlled
 * listing URL could poison address A with listing B. These tests keep that
 * legal/provenance boundary closed and require inspection tenancy when supplied.
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
    propertyLookup: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/scraping/dispatch", () => ({
  fetchHtmlViaWorkspaceProvider: vi.fn(async () => ({
    html: "",
    status: 403,
    providerUsed: "SHARED",
    fellBack: false,
  })),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));

// RA-6922: the route gates on requireAddon() before the cache read. These tests
// target the RA-1761 cache-read FILTER in isolation, so grant the add-on so the
// handler reaches that code path.
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(async () => ({
    allowed: true,
    sku: "FLOORPLAN_UNDERLAY",
    workspaceId: "ws_test",
  })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
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
const mockTenancy = assertInspectionTenancy as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_UNDERLAY_URL_IMPORT", "1");
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  mockTenancy.mockResolvedValue({ ok: true });
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/properties/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Track B — listing cache and inspection boundary", () => {
  it("never reads or writes the legacy global property cache", async () => {
    await POST(
      makePost({
        url: "https://www.onthehouse.com.au/property/qld/brisbane-4000/example",
      }),
    );

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("authorises an inspection-bound scrape before provider dispatch", async () => {
    mockTenancy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const res = await POST(
      makePost({
        inspectionId: "foreign-inspection",
        url: "https://www.onthehouse.com.au/property/qld/brisbane-4000/example",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockTenancy).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "u_test" } }),
      "foreign-inspection",
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
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
