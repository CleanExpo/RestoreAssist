import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireClientAuth = vi.fn();

vi.mock("@/lib/portal/require-client-auth", () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { clientUser: { findUnique: vi.fn() } },
}));

import { GET } from "../route";

function request(bearer = "not.a.real.token") {
  return new NextRequest("http://localhost/api/portal/auth/me", {
    headers: { authorization: `Bearer ${bearer}` },
  });
}

describe("GET /api/portal/auth/me — RA-7509 launch probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 with PORTAL_JWT_SECRET_MISSING when portal JWT is not configured", async () => {
    requireClientAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        {
          error:
            "CLIENT_PORTAL_JWT_SECRET must be set for portal auth (see lib/env-check.ts)",
          code: "PORTAL_JWT_SECRET_MISSING",
        },
        { status: 503 },
      ),
    });

    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: "PORTAL_JWT_SECRET_MISSING",
    });
  });

  it("returns 401 for an invalid bearer when auth is configured", async () => {
    requireClientAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized — please sign in again" },
        { status: 401 },
      ),
    });

    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Unauthorized — please sign in again",
    });
  });
});
