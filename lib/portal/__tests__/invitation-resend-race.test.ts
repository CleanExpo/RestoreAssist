/**
 * RA-8613 - a resend must never reopen an invitation that was revoked or
 * accepted after the resend read it.
 *
 * These tests run the real resend, revoke and accept code against one
 * in-memory invitation table, in the order a real race produces: the resend
 * reads the invitation, the other request finishes, then the resend writes.
 * Reads return copies, so the resend really is holding a stale row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => {
  process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

  const invitations: Row[] = [];
  const clientUsers: Row[] = [];
  const deferred: Array<() => Promise<unknown>> = [];
  const sent: Array<{ to: string; html: string }> = [];
  const hook: { beforeNextInvitationWrite: null | (() => Promise<void>) } = {
    beforeNextInvitationWrite: null,
  };

  /** The filters the code under test uses. Anything else fails loudly. */
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, condition]) => {
      const value = row[key];
      if (condition === null || typeof condition !== "object") {
        return value === condition;
      }
      const filter = condition as Row;
      if (Array.isArray(filter.in)) return filter.in.includes(value);
      if ("equals" in filter) {
        return filter.mode === "insensitive"
          ? String(value).toLowerCase() === String(filter.equals).toLowerCase()
          : value === filter.equals;
      }
      throw new Error(`fake prisma: unsupported filter on ${key}`);
    });
  }

  /** Lets a test run another request between a read and the write after it. */
  async function runWriteHook() {
    const pending = hook.beforeNextInvitationWrite;
    hook.beforeNextInvitationWrite = null;
    if (pending) await pending();
  }

  const portalInvitation = {
    findMany: async ({ where }: { where: Row }) =>
      invitations.filter((row) => matches(row, where)).map((row) => ({ ...row })),
    findFirst: async ({ where }: { where: Row }) => {
      const row = invitations.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }: { where: Row }) => {
      const row = invitations.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      await runWriteHook();
      const row = invitations.find((candidate) => matches(candidate, where));
      if (!row) throw new Error("fake prisma: no invitation to update");
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      await runWriteHook();
      const rows = invitations.filter((candidate) => matches(candidate, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
  };

  const clientUser = {
    findFirst: async ({ where }: { where: Row }) =>
      clientUsers.find((row) => matches(row, where)) ?? null,
    findUnique: async ({ where }: { where: Row }) =>
      clientUsers.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: `client_user_${clientUsers.length + 1}`, ...data };
      clientUsers.push(row);
      return row;
    },
  };

  const prisma = {
    portalInvitation,
    clientUser,
    $transaction: async (work: (tx: unknown) => unknown) =>
      work({ portalInvitation, clientUser }),
  };

  return { invitations, clientUsers, deferred, sent, hook, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: state.prisma }));
// The public resend hands its write to `after()`: it runs once the response
// has gone. Holding that work here is what lets another request finish first.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: () => Promise<unknown>) => {
      state.deferred.push(work);
    },
  };
});
vi.mock("@/lib/email/send-transactional", () => ({
  sendTransactionalEmail: vi.fn(async (mail: { to: string; html: string }) => {
    state.sent.push({ to: mail.to, html: mail.html });
    return { error: null };
  }),
}));
vi.mock("@/lib/email", () => ({ escapeHtml: (value: string) => value }));
vi.mock("@/lib/portal/recovery-email", () => ({ emailRecoveryLink: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "contractor_1", userType: "contractor" },
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { requestPortalInvitationResend } from "../request-invitation-resend";
import { DELETE as revokeInvitation } from "@/app/api/portal/invitations/[id]/route";
import { POST as staffResend } from "@/app/api/portal/invitations/[id]/resend/route";
import { POST as acceptInvitation } from "@/app/api/portal/invitations/accept/route";

const INVITATION_ID = "inv_1";
const TOKEN = "cabcdefghijklmnopqrstuvwx";
const EMAIL = "homeowner@example.com";
const ORIGINAL_EXPIRY = new Date("2030-01-01T00:00:00.000Z");

function seedInvitation(status: "PENDING" | "EXPIRED") {
  state.invitations.push({
    id: INVITATION_ID,
    token: TOKEN,
    email: EMAIL,
    clientId: "client_1",
    userId: "contractor_1",
    status,
    expiresAt: ORIGINAL_EXPIRY,
    acceptedAt: null,
    createdAt: new Date("2029-12-25T00:00:00.000Z"),
    client: { name: "Home Owner", email: EMAIL },
    user: { name: "Con Tractor", businessName: "Acme Restoration", organizationId: null },
  });
}

const invitation = () => state.invitations[0];
const params = { params: Promise.resolve({ id: INVITATION_ID }) };

function revoke() {
  return revokeInvitation(
    new NextRequest(`http://localhost/api/portal/invitations/${INVITATION_ID}`, {
      method: "DELETE",
    }),
    params,
  );
}

function resendAsStaff() {
  return staffResend(
    new NextRequest(
      `http://localhost/api/portal/invitations/${INVITATION_ID}/resend`,
      { method: "POST" },
    ),
    params,
  );
}

function accept() {
  return acceptInvitation(
    new NextRequest("http://localhost/api/portal/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: TOKEN,
        password: "a-long-enough-password",
        name: "Home Owner",
      }),
    }),
  );
}

/** Runs the work the public resend left for after its response. */
async function runDeferredWork() {
  for (const work of state.deferred.splice(0)) await work();
}

beforeEach(() => {
  state.invitations.length = 0;
  state.clientUsers.length = 0;
  state.deferred.length = 0;
  state.sent.length = 0;
  state.hook.beforeNextInvitationWrite = null;
});

describe("a public resend that loses the race", () => {
  it("does not reopen an invitation revoked after the resend read it", async () => {
    seedInvitation("PENDING");

    await requestPortalInvitationResend(EMAIL);
    // The resend has read the PENDING row and answered; its write is still to come.
    expect(state.deferred).toHaveLength(1);
    expect(state.sent).toHaveLength(0);

    expect((await revoke()).status).toBe(200);
    expect(invitation().status).toBe("REVOKED");

    await runDeferredWork();

    expect(invitation().status).toBe("REVOKED");
    expect(invitation().expiresAt).toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(0);
  });

  it("does not reopen an invitation accepted after the resend read it", async () => {
    seedInvitation("PENDING");

    await requestPortalInvitationResend(EMAIL);
    expect(state.deferred).toHaveLength(1);

    expect((await accept()).status).toBeLessThan(300);
    expect(invitation().status).toBe("ACCEPTED");
    expect(state.clientUsers).toHaveLength(1);

    await runDeferredWork();

    expect(invitation().status).toBe("ACCEPTED");
    expect(invitation().expiresAt).toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(0);
  });
});

describe("a staff resend that loses the race", () => {
  it("answers 409 and sends nothing when the invitation is revoked mid-request", async () => {
    seedInvitation("PENDING");
    // The revoke lands after the resend route has read the row, before it writes.
    state.hook.beforeNextInvitationWrite = async () => {
      expect((await revoke()).status).toBe(200);
    };

    const response = await resendAsStaff();

    expect(response.status).toBe(409);
    expect(invitation().status).toBe("REVOKED");
    expect(invitation().expiresAt).toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(0);
  });

  it("answers 409 and sends nothing when the invitation is accepted mid-request", async () => {
    seedInvitation("PENDING");
    state.hook.beforeNextInvitationWrite = async () => {
      expect((await accept()).status).toBeLessThan(300);
    };

    const response = await resendAsStaff();

    expect(response.status).toBe(409);
    expect(invitation().status).toBe("ACCEPTED");
    expect(invitation().expiresAt).toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(0);
  });
});

describe("a resend with no race still works", () => {
  it("extends a pending invitation and emails its link (public)", async () => {
    seedInvitation("PENDING");

    await requestPortalInvitationResend(EMAIL);
    await runDeferredWork();

    expect(invitation().status).toBe("PENDING");
    expect(invitation().expiresAt).not.toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].to).toBe(EMAIL);
    expect(state.sent[0].html).toContain(`/portal/signup?token=${TOKEN}`);
  });

  it("reopens an expired invitation and emails its link (public)", async () => {
    seedInvitation("EXPIRED");

    await requestPortalInvitationResend(EMAIL);
    await runDeferredWork();

    expect(invitation().status).toBe("PENDING");
    expect(invitation().expiresAt).not.toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(1);
  });

  it("extends a pending invitation and emails its link (staff)", async () => {
    seedInvitation("PENDING");

    const response = await resendAsStaff();

    expect(response.status).toBe(200);
    expect(invitation().status).toBe("PENDING");
    expect(invitation().expiresAt).not.toBe(ORIGINAL_EXPIRY);
    expect(state.sent).toHaveLength(1);
  });
});
