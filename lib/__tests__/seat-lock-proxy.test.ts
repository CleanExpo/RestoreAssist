/**
 * D-029: the day 15 lock in proxy.ts. A technician whose free seat has ended cannot
 * write or open the dashboard, and can still sign in or out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn().mockResolvedValue({ showHardWall: false }),
}));

import { getToken } from "next-auth/jwt";
import { proxy } from "../../proxy";

function request(pathname: string, method = "GET") {
  const parsed = new URL(`http://test${pathname}`);
  return {
    nextUrl: {
      pathname,
      origin: "http://test",
      clone: () => new URL(`http://test${pathname}`),
      search: "",
      searchParams: parsed.searchParams,
    },
    url: `http://test${pathname}`,
    method,
    headers: new Headers({ origin: "http://test" }),
  } as never;
}

const signedIn = (seatLocked: boolean) =>
  vi.mocked(getToken).mockResolvedValue({
    sub: "tech",
    role: "USER",
    setupCompletedAt: "2026-01-01T00:00:00.000Z",
    seatLocked,
  } as never);

describe("the day 15 seat lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers a write with 402 and tells offline queues to hold it", async () => {
    signedIn(true);
    const reply = await proxy(request("/api/inspections", "POST"));
    expect(reply.status).toBe(402);
    expect(reply.headers.get("x-restoreassist-offline-paused")).toBe("1");
  });

  it("sends the dashboard to the seat page", async () => {
    signedIn(true);
    const reply = await proxy(request("/dashboard"));
    expect(reply.status).toBe(307);
    expect(reply.headers.get("location")).toContain("/seat-required");
  });

  it("leaves signing in and out open", async () => {
    signedIn(true);
    const reply = await proxy(request("/api/auth/signout", "POST"));
    expect(reply.status).not.toBe(402);
  });

  it("does nothing once the seat is paid", async () => {
    signedIn(false);
    const write = await proxy(request("/api/inspections", "POST"));
    expect(write.status).not.toBe(402);
    const page = await proxy(request("/dashboard"));
    expect(page.headers.get("location") ?? "").not.toContain("/seat-required");
  });
});
