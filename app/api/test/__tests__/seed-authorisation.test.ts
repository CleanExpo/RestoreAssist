import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const authCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    authorisation: { create: (...a: unknown[]) => authCreate(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/seed-authorisation", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  authCreate.mockReset();
});

describe("POST /api/test/seed-authorisation", () => {
  it("returns 404 when ALLOW_TEST_HELPERS is not 'true'", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../seed-authorisation/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("returns 401 when no session", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce(null);
    vi.resetModules();
    const { POST } = await import("../seed-authorisation/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns 200 happy path when ALLOW_TEST_HELPERS=true (inserts Authorisation row)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_test",
      organization: { name: "Test Org", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_test_1" });

    vi.resetModules();
    const { POST } = await import("../seed-authorisation/route");
    const res = await POST(
      makeReq({ subjectLicenceNumber: "IICRC-1", whsCardNumber: "WHS-1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authorisationId: "auth_test_1" });

    expect(authCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u_test",
        subjectUserId: "u_test",
        subjectCompanyName: "Test Org",
        subjectLicenceNumber: "IICRC-1",
        whsCardNumber: "WHS-1",
        verifiedMethod: "SELF_DECLARED",
        status: "VALID",
      }),
      select: { id: true },
    });
    vi.unstubAllEnvs();
  });

  it("defaults licence + WHS values when omitted", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_test",
      organization: { name: "Test Org", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_default" });
    vi.resetModules();
    const { POST } = await import("../seed-authorisation/route");
    await POST(makeReq({}));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectLicenceNumber: "IICRC-TEST",
          whsCardNumber: "WHS-TEST",
        }),
      }),
    );
    vi.unstubAllEnvs();
  });
});
