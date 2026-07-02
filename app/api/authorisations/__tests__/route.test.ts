import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const authCreate = vi.fn();
const invalidateAuthorisationCache = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    authorisation: { create: (...a: unknown[]) => authCreate(...a) },
  },
}));
vi.mock("@/lib/authorisations/most-recent", () => ({
  invalidateAuthorisationCache: (...a: unknown[]) => invalidateAuthorisationCache(...a),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  authCreate.mockReset();
  invalidateAuthorisationCache.mockReset();
});

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/authorisations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  inspectionId: "insp_1",
  subjectLicenceNumber: "IICRC-1",
  whsCardNumber: "WHS-1",
  subjectLicenceState: "QLD",
  subjectLicenceClass: "Restoration",
  publicLiabilityInsurer: "CGU",
  publicLiabilityPolicyNumber: "POL-1",
};

describe("POST /api/authorisations", () => {
  it("returns 401 unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when subjectLicenceNumber missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    const res = await POST(makeReq({ ...validBody, subjectLicenceNumber: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when whsCardNumber missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    const res = await POST(makeReq({ ...validBody, whsCardNumber: undefined }));
    expect(res.status).toBe(400);
  });

  it("creates an Authorisation row with subjectUserId = session.user.id", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, authorisationId: "auth_1" });
    expect(authCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectUserId: "u_1",
        userId: "u_1",
        subjectCompanyName: "Acme",
        subjectLicenceNumber: "IICRC-1",
        whsCardNumber: "WHS-1",
        verifiedMethod: "SELF_DECLARED",
      }),
      select: { id: true },
    });
  });

  it("prefers legalName then tradingName over name for subjectCompanyName", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "fallback", legalName: "Acme Pty Ltd", tradingName: "Acme" },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subjectCompanyName: "Acme Pty Ltd" }),
      }),
    );
  });

  it("invalidates the most-recent cache after a successful create", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(invalidateAuthorisationCache).toHaveBeenCalledWith("u_1");
  });

  it("persists publicLiabilityCoverAmount when provided", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq({ ...validBody, publicLiabilityCoverAmount: 20000000 }));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicLiabilityCoverAmount: 20000000 }),
      }),
    );
  });

  it("persists null publicLiabilityCoverAmount when omitted", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicLiabilityCoverAmount: null }),
      }),
    );
  });

  it("dual-writes subjectLicenceClass (string) + subjectLicenceClassEnum when caller passes the enum (P1 #19 step 1 of 2)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(
      makeReq({ ...validBody, subjectLicenceClassEnum: "OPEN" }),
    );
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectLicenceClass: "Restoration",
          subjectLicenceClassEnum: "OPEN",
        }),
      }),
    );
  });

  it("writes subjectLicenceClassEnum=null when caller omits the enum (legacy callers unchanged)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectLicenceClassEnum: null,
        }),
      }),
    );
  });

  it("returns 400 when subjectLicenceClassEnum is not a valid enum member", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    const res = await POST(
      makeReq({ ...validBody, subjectLicenceClassEnum: "NOT_REAL" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 with generic error (rule 7) when DB throws", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockRejectedValueOnce(new Error("DB exploded"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal server error");
    // rule 7: the raw exception detail must never leak to the client
    expect(JSON.stringify(body)).not.toContain("DB exploded");
  });
});
