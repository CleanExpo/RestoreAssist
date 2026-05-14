import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const orgCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    organization: { create: (...a: unknown[]) => orgCreate(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/sign-in-as", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset();
  orgCreate.mockReset();
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

describe("POST /api/test/sign-in-as", () => {
  it("returns 404 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { POST } = await import("../sign-in-as/route");
    const res = await POST(makeReq({ role: "USER" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("returns 400 when role is invalid", async () => {
    vi.resetModules();
    const { POST } = await import("../sign-in-as/route");
    const res = await POST(makeReq({ role: "OWNER" }));
    expect(res.status).toBe(400);
  });

  it("creates user + org and sets session cookie when user does not exist", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({
      id: "u_1",
      email: "test-user@test.local",
      organizationId: null,
    });
    orgCreate.mockResolvedValueOnce({ id: "org_1" });
    userUpdate.mockResolvedValueOnce({ id: "u_1" });

    vi.resetModules();
    const { POST } = await import("../sign-in-as/route");
    const res = await POST(makeReq({ role: "USER" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("next-auth.session-token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(orgCreate).toHaveBeenCalledTimes(1);
  });

  it("reuses existing user (no create) and sets cookie", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "u_2",
      email: "test-user@test.local",
      organizationId: "org_existing",
    });

    vi.resetModules();
    const { POST } = await import("../sign-in-as/route");
    const res = await POST(makeReq({ role: "USER" }));
    expect(res.status).toBe(200);
    expect(userCreate).not.toHaveBeenCalled();
    expect(orgCreate).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toContain("next-auth.session-token=");
  });
});
