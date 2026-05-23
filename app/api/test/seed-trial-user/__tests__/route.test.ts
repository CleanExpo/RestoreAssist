import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const userCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: (...a: unknown[]) => userCreate(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/seed-trial-user", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userCreate.mockReset();
});

describe("POST /api/test/seed-trial-user", () => {
  it("returns 403 when ALLOW_TEST_HELPERS is not set", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ daysUntilExpiry: 3 }));
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("seeds a TRIAL user with N days remaining", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    userCreate.mockResolvedValueOnce({
      id: "u_test",
      email: "trial-test-123@example.com",
    });

    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ daysUntilExpiry: 3 }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.email).toMatch(/^trial-test-/);
    expect(body.data.daysRemaining).toBe(3);
    expect(body.data.subscriptionStatus).toBe("TRIAL");

    expect(userCreate).toHaveBeenCalledTimes(1);
    const arg = userCreate.mock.calls[0][0];
    expect(arg.data.subscriptionStatus).toBe("TRIAL");
    expect(arg.data.creditsRemaining).toBe(100);
    expect(arg.data.trialEndsAt).toBeInstanceOf(Date);
    // trialEndsAt should be ~3 days in the future
    const diffMs = (arg.data.trialEndsAt as Date).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
    vi.unstubAllEnvs();
  });

  it("returns 400 when body fails validation", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ daysUntilExpiry: "not-a-number" }));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("honours custom subscriptionStatus when provided", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    userCreate.mockResolvedValueOnce({
      id: "u_test",
      email: "trial-test-456@example.com",
    });

    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(
      makeReq({ daysUntilExpiry: -1, subscriptionStatus: "EXPIRED" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.subscriptionStatus).toBe("EXPIRED");
    expect(body.data.daysRemaining).toBe(-1);
    expect(userCreate.mock.calls[0][0].data.subscriptionStatus).toBe("EXPIRED");
    vi.unstubAllEnvs();
  });
});
