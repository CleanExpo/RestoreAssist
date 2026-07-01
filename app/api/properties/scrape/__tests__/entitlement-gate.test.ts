/**
 * PR5 — floor-plan underlay is gated behind the Premium tier.
 *
 * Unentitled users (Standard / no tier) get a 402 so the client can show an
 * "Upgrade to unlock" CTA; entitled users (Premium+) proceed as before.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
    user: { findUnique: vi.fn() },
    propertyLookup: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockUser = (
  prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
).user.findUnique;
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

describe("PR5 — floor-plan underlay Premium gate", () => {
  it("returns 402 for a Standard-tier user", async () => {
    mockUser.mockResolvedValueOnce({
      id: "u_test",
      subscriptionTier: { tierName: "STANDARD" },
    });

    const res = await POST(makePost({ address: "12 Smith St" }));

    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error.code).toBe("PAYMENT_REQUIRED");
  });

  it("returns 402 for a user with no tier", async () => {
    mockUser.mockResolvedValueOnce({ id: "u_test", subscriptionTier: null });

    const res = await POST(makePost({ address: "12 Smith St" }));

    expect(res.status).toBe(402);
  });

  it("lets a Premium-tier user through (serves cached data, not 402)", async () => {
    mockUser.mockResolvedValueOnce({
      id: "u_test",
      subscriptionTier: { tierName: "PREMIUM" },
    });
    mockFindFirst.mockResolvedValueOnce({
      id: "pl_1",
      propertyAddress: "12 SMITH ST",
      propertyPostcode: "4000",
      dataSource: "onthehouse",
      expiresAt: new Date(Date.now() + 86_400_000),
      propertyData: { address: "12 SMITH ST", floorPlanImages: [] },
    });

    const res = await POST(
      makePost({ address: "12 Smith St", postcode: "4000" }),
    );

    expect(res.status).not.toBe(402);
  });
});
