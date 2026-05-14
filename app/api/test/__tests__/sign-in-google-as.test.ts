import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const userCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/sign-in-google-as", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

describe("POST /api/test/sign-in-google-as", () => {
  it("returns 404 when ALLOW_TEST_HELPERS is not 'true'", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../sign-in-google-as/route");
    const res = await POST(makeReq({ email: "x@y.com" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("returns 400 when email is missing", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.resetModules();
    const { POST } = await import("../sign-in-google-as/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    vi.unstubAllEnvs();
  });

  it("returns 200 happy path when ALLOW_TEST_HELPERS=true (creates user when none exists)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({
      id: "u_google_1",
      email: "newtech@example.com",
      role: "USER",
    });
    vi.resetModules();
    const { POST } = await import("../sign-in-google-as/route");
    const res = await POST(makeReq({ email: "newtech@example.com" }));
    expect(res.status).toBe(200);
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("next-auth.session-token=");
    vi.unstubAllEnvs();
  });

  it("reuses existing user and sets cookie", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    userFindUnique.mockResolvedValueOnce({
      id: "u_google_2",
      email: "existing@example.com",
      role: "USER",
    });
    vi.resetModules();
    const { POST } = await import("../sign-in-google-as/route");
    const res = await POST(makeReq({ email: "existing@example.com" }));
    expect(res.status).toBe(200);
    expect(userCreate).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toContain("next-auth.session-token=");
    vi.unstubAllEnvs();
  });
});
