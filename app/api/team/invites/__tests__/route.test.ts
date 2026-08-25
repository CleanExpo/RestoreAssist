import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: the same-org role update in POST /api/team/invites (Case 1 — invitee
// already in the caller's org) must re-assert the org in the write `where`.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userUpdate = vi.fn();
const userInviteCreate = vi.fn();
const userInviteFindFirst = vi.fn();
const sendInviteEmail = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/sanitize", () => ({ sanitizeString: (s: string) => s }));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmail(...args),
}));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: vi.fn(async (fn: () => unknown) => fn()),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  EmailDeliveryPending: class EmailDeliveryPending extends Error {},
  deliverEmailOnce: vi.fn(async ({ send }: { send: () => Promise<unknown> }) => {
    const result = await send();
    return { messageId: (result as any).data.id, replayed: false, result };
  }),
}));
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: () => ({ ok: true, key: "test-idempotency-key" }),
  withIdempotency: async (r: NextRequest, _s: string, cb: (body: string) => Promise<Response>) =>
    cb(await r.text()),
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
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    organization: { create: vi.fn() },
    userInvite: {
      create: (...a: unknown[]) => userInviteCreate(...a),
      findFirst: (...a: unknown[]) => userInviteFindFirst(...a),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findUnique: (...a: unknown[]) => userFindUnique(...a),
          findFirst: (...a: unknown[]) => userFindFirst(...a),
          update: (...a: unknown[]) => userUpdate(...a),
        },
        userInvite: {
          create: (...a: unknown[]) => userInviteCreate(...a),
          findFirst: (...a: unknown[]) => userInviteFindFirst(...a),
        },
        $executeRaw: vi.fn(),
      }),
  },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  // ensureOrganizationForUser(admin1) → user already has org1 (no create path).
  // existingUser lookup (by email) → a USER already in org1 (Case 1).
  userFindUnique.mockImplementation(
    () =>
      Promise.resolve({
        id: "admin1",
        name: "Admin",
        role: "ADMIN",
        organizationId: "org1",
      }),
  );
  userFindFirst.mockResolvedValue({
    id: "existing1",
    email: "e@x.com",
    name: "E",
    role: "USER",
    organizationId: "org1",
    organization: {
      id: "org1",
      name: "Org",
      owner: { id: "admin1", name: "Admin", email: "a@x.com" },
    },
  });
  userUpdate.mockResolvedValue({ id: "existing1", role: "MANAGER" });
  userInviteCreate.mockResolvedValue({ id: "inv1", token: "tok" });
  userInviteFindFirst.mockResolvedValue(null);
  sendInviteEmail.mockResolvedValue({
    data: { id: "provider_receipt_1" },
    error: null,
  });
});

describe("POST /api/team/invites — same-org role update (Case 1)", () => {
  it("scopes the role update to the caller's organization", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "e@x.com", role: "MANAGER" }),
      }),
    );
    // Primary assertion: the write re-asserts the org boundary.
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "existing1",
          organizationId: "org1",
          role: "USER",
        },
      }),
    );
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: "e@x.com", mode: "insensitive" },
        },
      }),
    );
    expect(res.status).toBeLessThan(400);
  });

  it.each(["org2", null])(
    "refuses an existing account outside the caller organization (%s)",
    async (organizationId) => {
      userFindFirst.mockResolvedValue({
        id: "existing1",
        email: "e@x.com",
        name: "E",
        role: "USER",
        organizationId,
        organization: null,
      });

      const res = await POST(
        new NextRequest("http://localhost/api/team/invites", {
          method: "POST",
          body: JSON.stringify({ email: "e@x.com", role: "USER" }),
        }),
      );

      expect(res.status).toBe(409);
      expect(userUpdate).not.toHaveBeenCalled();
      expect(userInviteCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed email syntax before any tenant mutation", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email", role: "USER" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(userInviteCreate).not.toHaveBeenCalled();
  });

  it("refuses an active invitation for the same identity in any tenant", async () => {
    userFindFirst.mockResolvedValue(null);
    userInviteFindFirst.mockResolvedValueOnce({ id: "active_invite" });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "new@x.com", role: "USER" }),
      }),
    );

    expect(res.status).toBe(409);
    expect(userInviteCreate).not.toHaveBeenCalled();
    expect(userInviteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ organizationId: expect.anything() }),
      }),
    );
  });

  it("prevents a manager from demoting another manager through the invite endpoint", async () => {
    getServerSession.mockResolvedValue({ user: { id: "manager1", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({
      id: "manager1",
      name: "Manager One",
      role: "MANAGER",
      organizationId: "org1",
    });
    userFindFirst.mockResolvedValue({
      id: "manager2",
      email: "manager2@x.com",
      name: "Manager Two",
      role: "MANAGER",
      organizationId: "org1",
      organization: { id: "org1" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "manager2@x.com", role: "USER" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userInviteCreate).not.toHaveBeenCalled();
  });

  it("refuses a stale role update when membership changed after the read", async () => {
    userUpdate.mockRejectedValueOnce({ code: "P2025" });

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "e@x.com", role: "MANAGER" }),
      }),
    );

    expect(res.status).toBe(409);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: "USER" }),
      }),
    );
    expect(userInviteCreate).not.toHaveBeenCalled();
  });

  it("keeps a same-org notification failure non-2xx after committing the role update", async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error("provider unavailable"));

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "e@x.com", role: "MANAGER" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(res.ok).toBe(false);
    expect(body).toMatchObject({
      error: "Email sending failed",
      updated: true,
      partial: true,
    });
    expect(userUpdate).toHaveBeenCalled();
    expect(userInviteCreate).toHaveBeenCalled();
  });

  it("keeps a new-invite delivery failure non-2xx after committing the invite", async () => {
    userFindFirst.mockResolvedValue(null);
    sendInviteEmail.mockRejectedValueOnce(new Error("provider unavailable"));

    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "new@x.com", role: "USER" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(res.ok).toBe(false);
    expect(body).toMatchObject({
      error: "Email sending failed",
      partial: true,
    });
    expect(body.inviteLink).toMatch(
      /^https:\/\/restoreassist\.app\/invite\/[a-f0-9]{48}$/,
    );
    expect(userInviteCreate).toHaveBeenCalled();
  });
});
