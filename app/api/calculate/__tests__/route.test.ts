import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: vi.fn().mockResolvedValue(null),
}));

const { userFindUnique } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user_abcd" } });
  userFindUnique
    .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
    .mockResolvedValueOnce({
      businessName: "Test Co",
      businessABN: "53 004 085 616",
      businessAddress: "1 St",
      businessPhone: null,
      businessEmail: "a@test.com",
      businessLogo: null,
    });
});

function calcReq(body: unknown) {
  return new NextRequest("http://localhost/api/calculate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  jobType: "water",
  affectedAreaM2: 10,
  numberOfRooms: 1,
  dryingDays: 1,
  labourHours: 1,
  airMoversAxial: 0,
  dehumidifiersLGR: 0,
  includeCallOut: false,
  includeAdminFee: false,
};

describe("POST /api/calculate", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(401);
  });

  it("400 on invalid payload", async () => {
    const res = await POST(calcReq({ jobType: "water" }));
    expect(res.status).toBe(400);
  });

  it("402 when subscription inactive", async () => {
    userFindUnique.mockReset();
    userFindUnique.mockResolvedValueOnce({ subscriptionStatus: "CANCELED" });
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(402);
  });

  it("enforces minimum charge and returns pricing honesty fields", async () => {
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.minimumApplied).toBe(true);
    expect(json.subtotalExGST).toBe(2750);
    expect(json.gst).toBe(275);
    expect(json.totalIncGST).toBe(3025);
    expect(json.pricingSource).toBe("default_rates");
    expect(String(json.pricingNote)).toMatch(/Cost Libraries/i);
  });
});
