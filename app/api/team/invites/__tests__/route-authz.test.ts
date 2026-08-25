import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: GET/POST /api/team/invites must authorize on the FRESH DB role,
// not the stale JWT claim. A user demoted after their token was issued must lose
// invite-create power and MANAGER-scoped views immediately, not at token expiry.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userInviteCreate = vi.fn();
const organizationCreate = vi.fn();
const getIdempotencyKey = vi.fn();

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
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: (...a: unknown[]) => getIdempotencyKey(...a),
  withIdempotency: async (r: NextRequest, _s: string, cb: (body: string) => Promise<Response>) =>
    cb(await r.text()),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  EmailDeliveryPending: class EmailDeliveryPending extends Error {},
  deliverEmailOnce: vi.fn(async ({ send }: { send: () => Promise<unknown> }) => send()),
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
    organization: { create: (...a: unknown[]) => organizationCreate(...a) },
    userInvite: {
      findMany: (...a: unknown[]) => userFindMany(...a),
      create: (...a: unknown[]) => userInviteCreate(...a),
    },
  },
}));

import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getIdempotencyKey.mockReturnValue({ ok: true, key: "test-idempotency-key" });
});

const postReq = () =>
  new NextRequest("http://localhost/api/team/invites", {
    method: "POST",
    body: JSON.stringify({ email: "e@x.com", role: "USER" }),
  });

describe("team/invites POST — DB-role authorization", () => {
  it("requires an Idempotency-Key before any invite mutation", async () => {
    getServerSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    userFindUnique.mockResolvedValue({ role: "ADMIN", organizationId: "org1" });
    getIdempotencyKey.mockReturnValue({ ok: true, key: null });
    const res = await POST(postReq());
    expect(res.status).toBe(400);
    expect(userInviteCreate).not.toHaveBeenCalled();
  });
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

  it("refuses an org-less MANAGER instead of lazily creating an owner organisation", async () => {
    getServerSession.mockResolvedValue({ user: { id: "removed_mgr", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({ role: "MANAGER", organizationId: null });

    const res = await POST(postReq());

    expect(res.status).toBe(403);
    expect(organizationCreate).not.toHaveBeenCalled();
    expect(userInviteCreate).not.toHaveBeenCalled();
  });
});

describe("team/invites GET — DB-role scoping", () => {
  it("refuses technicians so bearer invite tokens are not disclosed", async () => {
    getServerSession.mockResolvedValue({ user: { id: "tech1", role: "USER" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org1" });

    const res = await GET(new NextRequest("http://localhost/api/team/invites"));

    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

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

  it("refuses an org-less removed MANAGER without creating a new organisation", async () => {
    getServerSession.mockResolvedValue({ user: { id: "removed_mgr", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({ role: "MANAGER", organizationId: null });

    const res = await GET(new NextRequest("http://localhost/api/team/invites"));

    expect(res.status).toBe(403);
    expect(organizationCreate).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });
});
