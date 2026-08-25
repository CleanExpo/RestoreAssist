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

describe("GET /api/invites/oauth-complete", () => {
  it("returns 400 when invite_token cookie is missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    const res = await GET(makeReq(undefined));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(INVITE_TOKEN));
    expect(res.status).toBe(401);
  });

  it("returns 410 when invite is already used", async () => {
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
    expect(res.status).toBe(410);
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
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("returns 410 idempotently on retry when invite already used", async () => {
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
    expect(res.status).toBe(410);
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
    expect(res.status).toBe(410);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
