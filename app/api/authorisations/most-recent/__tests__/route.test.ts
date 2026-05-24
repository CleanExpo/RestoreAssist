import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const mostRecentAuthorisationForUser = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/authorisations/most-recent", () => ({
  mostRecentAuthorisationForUser: (...a: unknown[]) =>
    mostRecentAuthorisationForUser(...a),
}));

beforeEach(() => {
  getServerSession.mockReset();
  mostRecentAuthorisationForUser.mockReset();
});

describe("GET /api/authorisations/most-recent", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("http://localhost/api/authorisations/most-recent"),
    );
    expect(res.status).toBe(401);
  });

  it("returns { row: null } when no prior Authorisation exists", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    mostRecentAuthorisationForUser.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("http://localhost/api/authorisations/most-recent"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ row: null });
  });

  it("returns { row: ... } when an Authorisation exists", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    const verifiedAt = new Date("2026-05-10T00:00:00Z");
    mostRecentAuthorisationForUser.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: null,
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: "CGU",
      publicLiabilityPolicyNumber: "POL-1",
      publicLiabilityCoverAmount: null,
      verifiedAt,
    });
    const res = await GET(
      new NextRequest("http://localhost/api/authorisations/most-recent"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.row.subjectLicenceNumber).toBe("IICRC-1");
    expect(body.row.verifiedAt).toBe(verifiedAt.toISOString());
  });

  it("scopes the query strictly to session.user.id", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_99" } });
    mostRecentAuthorisationForUser.mockResolvedValueOnce(null);
    await GET(
      new NextRequest("http://localhost/api/authorisations/most-recent"),
    );
    expect(mostRecentAuthorisationForUser).toHaveBeenCalledWith("user_99");
  });
});
