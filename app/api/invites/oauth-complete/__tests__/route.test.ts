import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdate = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
  },
}));

beforeEach(() => {
  getServerSession.mockReset();
  inviteFindUnique.mockReset();
  inviteUpdate.mockReset();
});

function makeReq(cookieValue: string | undefined): NextRequest {
  const req = new NextRequest("http://localhost/api/invites/oauth-complete");
  if (cookieValue) {
    req.cookies.set("invite_token", cookieValue);
  }
  return req;
}

describe("GET /api/invites/oauth-complete", () => {
  it("returns 400 when invite_token cookie is missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    const res = await GET(makeReq(undefined));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq("abc123"));
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
    const res = await GET(makeReq("abc123"));
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
    inviteUpdate.mockResolvedValueOnce({});
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/invite\/abc123\?step=2$/);
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
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(410);
  });
});
