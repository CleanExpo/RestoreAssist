/**
 * RA-6940 — guards on the seed-trial-user test helper.
 *
 * The route must refuse to run unless ALLOW_TEST_HELPERS=true, and must
 * refuse even then when VERCEL_ENV=production (same hard-block as
 * sign-in-as) so a single env-var misconfig can never seed users into the
 * production database.
 */
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
  userCreate.mockResolvedValue({
    id: "u_trial",
    email: "trial-test-1@example.com",
  });
});

describe("POST /api/test/seed-trial-user", () => {
  it("returns 403 when ALLOW_TEST_HELPERS is not 'true'", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../seed-trial-user/route");
    const res = await POST(makeReq({ daysUntilExpiry: 3 }));
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("RA-6940: returns 403 in production even when ALLOW_TEST_HELPERS=true", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { POST } = await import("../seed-trial-user/route");
    const res = await POST(makeReq({ daysUntilExpiry: 3 }));
    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 200 and seeds the user outside production", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const { POST } = await import("../seed-trial-user/route");
    const res = await POST(makeReq({ daysUntilExpiry: 3 }));
    expect(res.status).toBe(200);
    expect(userCreate).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
