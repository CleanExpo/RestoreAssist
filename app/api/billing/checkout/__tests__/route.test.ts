import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("stripe", () => {
  const ctor = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test_123",
          url: "https://stripe.test/cs_123",
        }),
      },
    },
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_test_123" }),
    },
  }));
  return { default: ctor };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

describe("POST /api/billing/checkout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 with no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "STANDARD" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid tier", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "test@x.com",
      stripeCustomerId: "cus_existing",
    } as any);
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "NOT_A_TIER" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 with Stripe URL on happy path", async () => {
    process.env.STRIPE_PRICE_STANDARD = "price_test_standard";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "test@x.com" },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "test@x.com",
      stripeCustomerId: "cus_existing",
    } as any);
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "STANDARD" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe("https://stripe.test/cs_123");
  });
});
