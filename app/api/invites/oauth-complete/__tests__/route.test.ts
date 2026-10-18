import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdate = vi.fn();
const userUpdate = vi.fn();
const INVITE_TOKEN = "a".repeat(48);

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: {
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

beforeEach(() => {
  getServerSession.mockReset();
  inviteFindUnique.mockReset();
  inviteUpdate.mockReset();
  userUpdate.mockReset();
});

function makeReq(token: string | undefined): NextRequest {
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return new NextRequest(`http://localhost/api/invites/oauth-complete${suffix}`);
}

// The route is the Google sign-in callbackUrl (a full-page navigation), so
// every failure redirects back to the invite page with an explainable code.
function expectInviteRedirect(res: Response, path: string): void {
  expect(res.status).toBe(307);
  const url = new URL(res.headers.get("location")!);
  expect(`${url.pathname}${url.search}`).toBe(path);
}

describe("GET /api/invites/oauth-complete", () => {
  it("redirects to /invite/invalid?error=invalid when the token is missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    const res = await GET(makeReq(undefined));
    expectInviteRedirect(res, "/invite/invalid?error=invalid");
  });

  it("redirects to the invite with error=signin when not authenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(INVITE_TOKEN));
    expectInviteRedirect(res, `/invite/${INVITE_TOKEN}?error=signin`);
    expect(inviteFindUnique).not.toHaveBeenCalled();
  });

  it("redirects with error=used when invite is already used", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq(INVITE_TOKEN));
    expectInviteRedirect(res, `/invite/${INVITE_TOKEN}?error=used`);
  });

  it("redirects to /invite/[token]?step=2 on success", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    userUpdate.mockResolvedValueOnce({});
    inviteUpdate.mockResolvedValueOnce({});
    const res = await GET(makeReq(INVITE_TOKEN));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(new RegExp(`/invite/${INVITE_TOKEN}\\?step=2$`));
    expect(userUpdate).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("refuses a signed-in Google identity that does not match the invite", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_2", email: "attacker@example.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq(INVITE_TOKEN));
    expectInviteRedirect(res, `/invite/${INVITE_TOKEN}?error=mismatch`);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("redirects with error=used idempotently on retry when invite already used", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq(INVITE_TOKEN));
    expectInviteRedirect(res, `/invite/${INVITE_TOKEN}?error=used`);
  });

  it("does NOT update user when invite is already used (atomic semantics)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq(INVITE_TOKEN));
    expectInviteRedirect(res, `/invite/${INVITE_TOKEN}?error=used`);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
