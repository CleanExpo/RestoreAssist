import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: GET/POST /api/team/invites must authorize on the FRESH DB role,
// not the stale JWT claim. A user demoted after their token was issued must lose
// invite-create power and MANAGER-scoped views immediately, not at token expiry.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userInviteCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/sanitize", () => ({ sanitizeString: (s: string) => s }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn() }));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: vi.fn(async (fn: () => unknown) => fn()),
}));
vi.mock("@/lib/notifications", () => ({ notifyTeamMemberJoined: vi.fn() }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: vi.fn(),
    },
    organization: { create: vi.fn() },
    userInvite: {
      findMany: (...a: unknown[]) => userFindMany(...a),
      create: (...a: unknown[]) => userInviteCreate(...a),
    },
  },
}));

import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

const postReq = () =>
  new NextRequest("http://localhost/api/team/invites", {
    method: "POST",
    body: JSON.stringify({ email: "e@x.com", role: "USER" }),
  });

describe("team/invites POST — DB-role authorization", () => {
  it("returns 403 when the JWT says MANAGER but the DB says USER (demoted)", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u1", role: "MANAGER" },
    });
    userFindUnique.mockResolvedValue({ role: "USER" });

    const res = await POST(postReq());

    expect(res.status).toBe(403);
    expect(userInviteCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when the user no longer exists in the DB", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    userFindUnique.mockResolvedValue(null);

    const res = await POST(postReq());

    expect(res.status).toBe(403);
    expect(userInviteCreate).not.toHaveBeenCalled();
  });
});

describe("team/invites GET — DB-role scoping", () => {
  it("scopes to own invites using the fresh MANAGER role even when the JWT claims ADMIN", async () => {
    getServerSession.mockResolvedValue({ user: { id: "mgr1", role: "ADMIN" } });
    // Both the role lookup and ensureOrganizationForUser read the same id.
    userFindUnique.mockResolvedValue({ role: "MANAGER", organizationId: "org1" });
    userFindMany.mockResolvedValue([]);

    const res = await GET(
      new NextRequest("http://localhost/api/team/invites"),
    );

    expect(res.status).toBe(200);
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1", createdById: "mgr1" },
      }),
    );
  });
});
