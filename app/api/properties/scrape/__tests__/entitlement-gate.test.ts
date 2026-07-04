/**
 * RA-6922 — floor-plan underlay add-on gate.
 *
 * The scrape route is gated by requireAddon(FLOORPLAN_UNDERLAY): a workspace
 * with an ACTIVE FeatureEntitlement is allowed through; everyone else gets a
 * fail-closed 402 the client turns into the upgrade CTA. requireAddon is mocked
 * here so the test runs without a database.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: Request,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => fn(await req.text()),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyLookup: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAddon } from "@/lib/entitlements";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRequireAddon = requireAddon as unknown as ReturnType<typeof vi.fn>;
const mockFindFirst = (
  prisma as unknown as {
    propertyLookup: { findFirst: ReturnType<typeof vi.fn> };
  }
).propertyLookup.findFirst;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  vi.spyOn(global, "fetch").mockImplementation(async () => {
    throw new Error("scraper should not be reached in these tests");
  });
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/properties/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("RA-6922 — floor-plan underlay add-on gate", () => {
  it("returns 402 when the workspace is not entitled to the add-on", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "FLOORPLAN_UNDERLAY",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makePost({ address: "12 Smith St" }));

    expect(res.status).toBe(402);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "FLOORPLAN_UNDERLAY");
    // The scraper/cache must never be reached for a gated request.
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 401 before checking the add-on when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makePost({ address: "12 Smith St" }));

    expect(res.status).toBe(401);
    expect(mockRequireAddon).not.toHaveBeenCalled();
  });

  it("passes the gate for an entitled workspace and proceeds to the handler", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "FLOORPLAN_UNDERLAY",
      workspaceId: "ws_1",
    });
    // No cache hit → the handler proceeds past the gate. A missing address/url
    // yields a 400 from the handler body, proving the 402 gate was cleared.
    mockFindFirst.mockResolvedValue(null);

    const res = await POST(makePost({}));

    expect(res.status).toBe(400);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "FLOORPLAN_UNDERLAY");
  });
});
