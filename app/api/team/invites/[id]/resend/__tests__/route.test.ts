import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: resending (extending) an invite must re-assert that the invite's
// creator is in the caller's org, in the write `where`, not just a prior check.

const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdate = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const sendInviteEmail = vi.fn();
const validateCsrf = vi.fn();
const getIdempotencyKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a),
}));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: async (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/csrf", () => ({
  validateCsrf: (...a: unknown[]) => validateCsrf(...a),
}));
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: (...a: unknown[]) => getIdempotencyKey(...a),
  withIdempotency: async (
    _req: unknown,
    _uid: string,
    cb: () => Promise<Response>,
  ) => cb(),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  EmailDeliveryPending: class EmailDeliveryPending extends Error {},
  deliverEmailOnce: vi.fn(
    async ({ send }: { send: () => Promise<unknown> }) => {
      const result = await send();
      return { messageId: (result as any).data.id, replayed: false, result };
    },
  ),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
  },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: "admin1", role: "ADMIN", organizationId: "org1" },
  });
  validateCsrf.mockReturnValue(null);
  getIdempotencyKey.mockReturnValue({ ok: true, key: "test-idempotency-key" });
  sendInviteEmail.mockResolvedValue({ data: { id: "email1" }, error: null });
  // Expired invite created by someone in the caller's org → triggers the extend.
  inviteFindUnique.mockResolvedValue({
    id: "inv1",
    token: "a".repeat(48),
    email: "e@x.com",
    role: "USER",
    usedAt: null,
    expiresAt: new Date(Date.now() - 1000),
    createdById: "admin1",
    createdBy: { id: "admin1", name: "Admin", organizationId: "org1" },
    organization: { name: "Org" },
  });
  inviteUpdate.mockResolvedValue({ id: "inv1" });
  userFindUnique.mockImplementation(({ where }) => {
    if (where.id === "admin1") {
      return {
        id: "admin1",
        name: "Admin",
        role: "ADMIN",
        organizationId: "org1",
      };
    }
    return null;
  });
  userFindFirst.mockResolvedValue(null);
});

describe("POST /api/team/invites/[id]/resend — org-scoped extend", () => {
  it("requires an Idempotency-Key before lookup or send", async () => {
    getIdempotencyKey.mockReturnValue({ ok: true, key: null });
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );
    expect(res.status).toBe(400);
    expect(inviteFindUnique).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
  it("scopes the invite lookup and rotates the bearer token in the fresh DB organisation", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "admin1" },
      select: { id: true, name: true, role: true, organizationId: true },
    });
    expect(inviteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1", organizationId: "org1" },
      }),
    );
    expect(inviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "inv1",
          organizationId: "org1",
          usedAt: null,
          role: "USER",
          token: "a".repeat(48),
        },
        data: expect.objectContaining({
          token: expect.stringMatching(/^[a-f0-9]{48}$/),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(res.status).toBeLessThan(400);
    const sent = sendInviteEmail.mock.calls[0][0];
    expect(sent.inviteLink).toMatch(
      /^http:\/\/localhost:3000\/invite\/[a-f0-9]{48}$/,
    );
    expect(sent.inviteLink).not.toContain("a".repeat(48));
  });

  it("rejects a request when strict CSRF validation fails", async () => {
    validateCsrf.mockReturnValueOnce(
      Response.json({ error: "CSRF validation failed" }, { status: 403 }),
    );
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );
    expect(res.status).toBe(403);
    expect(validateCsrf).toHaveBeenCalledWith(expect.anything(), {
      requireOrigin: true,
    });
    expect(inviteFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a caller whose ADMIN session is stale after DB demotion", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "admin1",
      name: "Former Admin",
      role: "USER",
      organizationId: "org1",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );

    expect(res.status).toBe(403);
    expect(inviteFindUnique).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("uses the current DB organisation instead of the stale session claim", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "admin1",
      name: "Admin",
      role: "ADMIN",
      organizationId: "org2",
    });
    inviteFindUnique.mockResolvedValueOnce(null);

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );

    expect(res.status).toBe(404);
    expect(inviteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1", organizationId: "org2" },
      }),
    );
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("rejects a manager attempting to resend another user's invite", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "admin1",
      name: "Manager",
      role: "MANAGER",
      organizationId: "org1",
    });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv1",
      email: "e@x.com",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      createdById: "other-user",
      createdBy: { id: "other-user", name: "Other" },
      organization: { name: "Org" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );

    expect(res.status).toBe(403);
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("keeps the old token revoked when replacement delivery cannot be confirmed", async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error("provider unavailable"));

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(res.ok).toBe(false);
    expect(body.partial).toBe(true);
    expect(new Date(body.invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(inviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ token: "a".repeat(48) }),
        data: expect.objectContaining({
          token: expect.not.stringMatching(/^a{48}$/),
        }),
      }),
    );
  });

  it("refuses resend when an account now exists for the invited email", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: "existing",
      email: "E@X.COM",
      organizationId: "org2",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );

    expect(res.status).toBe(409);
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { email: { equals: "e@x.com", mode: "insensitive" } },
    });
    expect(sendInviteEmail).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it("refuses to resend a legacy invite that carries an ADMIN role", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv1",
      token: "a".repeat(48),
      email: "e@x.com",
      role: "ADMIN",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      createdById: "admin1",
      createdBy: { id: "admin1", name: "Admin" },
      organization: { name: "Org" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );

    expect(res.status).toBe(409);
    expect(inviteUpdate).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});
