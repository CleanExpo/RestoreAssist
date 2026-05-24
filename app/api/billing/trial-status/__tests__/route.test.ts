import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/trial-handling", () => ({ getTrialStatus: vi.fn() }));

import { getServerSession } from "next-auth";
import { getTrialStatus } from "@/lib/trial-handling";

describe("GET /api/billing/trial-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 with no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/billing/trial-status");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 200 with TrialStatus shape", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as any);
    vi.mocked(getTrialStatus).mockResolvedValue({
      isTrialActive: true,
      hasTrialExpired: false,
      daysRemaining: 5,
      trialEndsAt: new Date(),
      subscriptionStatus: "TRIAL",
      creditsRemaining: 100,
      lifetimeAccess: false,
      showCountdownBanner: false,
      showHardWall: false,
    } as any);
    const req = new Request("http://localhost/api/billing/trial-status");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.daysRemaining).toBe(5);
  });
});
