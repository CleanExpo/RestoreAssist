import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8462: a team invite sent to the wrong address must be cancellable.
// Cancel is a soft revoke: the row stays (who and when are recorded), the
// bearer token is rotated so the emailed link stops resolving, and expiresAt
// is set to the cancel time so every "live invite" predicate (seat count,
// active-invite check on create) stops counting it.

const getServerSession = vi.fn();
const validateCsrf = vi.fn();
const userFindUnique = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdateMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({
  validateCsrf: (...a: unknown[]) => validateCsrf(...a),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      updateMany: (...a: unknown[]) => inviteUpdateMany(...a),
    },
  },
}));

import { DELETE } from "../route";

const OLD_TOKEN = "a".repeat(48);

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    email: "wrong@example.com",
    role: "USER",
    usedAt: null,
    revokedAt: null,
    createdById: "admin1",
    ...overrides,
  };
}

function asUser(id: string, role: string, organizationId: string | null) {
  getServerSession.mockResolvedValue({ user: { id } });
  userFindUnique.mockResolvedValue({ id, role, organizationId });
}

function cancel(id = "inv1") {
  return DELETE(
    new NextRequest(`http://localhost/api/team/invites/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrf.mockReturnValue(null);
  asUser("admin1", "ADMIN", "org1");
  inviteFindUnique.mockResolvedValue(pendingInvite());
  inviteUpdateMany.mockResolvedValue({ count: 1 });
});

describe("DELETE /api/team/invites/[id] — cancel a pending invite", () => {
  it("lets an owner cancel an unused invite: records who and when, kills the link and frees the seat", async () => {
    const before = Date.now();
    const res = await cancel();
    expect(res.status).toBe(200);

    expect(inviteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1", organizationId: "org1" } }),
    );
    expect(inviteUpdateMany).toHaveBeenCalledTimes(1);
    const { where, data } = inviteUpdateMany.mock.calls[0][0];
    // The write re-asserts the state it read, so a concurrent accept wins
    // cleanly instead of being overwritten.
    expect(where).toEqual({
      id: "inv1",
      organizationId: "org1",
      usedAt: null,
      revokedAt: null,
    });
    expect(data.revokedById).toBe("admin1");
    expect(data.revokedAt).toBeInstanceOf(Date);
    // Old link refused by GET and POST /api/invites/[token]: they look the
    // invite up by token, and the token is no longer the emailed one.
    expect(data.token).toMatch(/^[0-9a-f]{48}$/);
    expect(data.token).not.toBe(OLD_TOKEN);
    // Seat freed and email re-invitable at once: the seat counter and the
    // create route's active-invite check both require expiresAt > now.
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before);
    // Soft revoke, never a hard delete or a fake acceptance.
    expect(data).not.toHaveProperty("usedAt");
  });

  it("lets a manager cancel an invite they created", async () => {
    asUser("mgr1", "MANAGER", "org1");
    inviteFindUnique.mockResolvedValue(pendingInvite({ createdById: "mgr1" }));
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(inviteUpdateMany.mock.calls[0][0].where).toEqual({
      id: "inv1",
      organizationId: "org1",
      usedAt: null,
      revokedAt: null,
      createdById: "mgr1",
    });
  });

  it("refuses a manager cancelling another manager's invite", async () => {
    asUser("mgr1", "MANAGER", "org1");
    inviteFindUnique.mockResolvedValue(pendingInvite({ createdById: "mgr2" }));
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to cancel an invite that has already been accepted", async () => {
    inviteFindUnique.mockResolvedValue(pendingInvite({ usedAt: new Date() }));
    const res = await cancel();
    expect(res.status).toBe(409);
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an invite id from another business", async () => {
    // The lookup is scoped to the caller's organisation, so another
    // business's invite is simply not found.
    inviteFindUnique.mockResolvedValue(null);
    const res = await cancel("other-org-invite");
    expect(res.status).toBe(404);
    expect(inviteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-org-invite", organizationId: "org1" },
      }),
    );
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a technician", async () => {
    asUser("tech1", "USER", "org1");
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(inviteFindUnique).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await cancel();
    expect(res.status).toBe(401);
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a request that fails CSRF validation", async () => {
    validateCsrf.mockReturnValue(
      Response.json({ error: "csrf" }, { status: 403 }),
    );
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("treats a repeat cancel as done without writing again", async () => {
    inviteFindUnique.mockResolvedValue(
      pendingInvite({ revokedAt: new Date() }),
    );
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("reports a conflict when the invite was accepted between read and write", async () => {
    inviteUpdateMany.mockResolvedValue({ count: 0 });
    const res = await cancel();
    expect(res.status).toBe(409);
  });
});
