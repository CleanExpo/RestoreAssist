/**
 * RA-8668 - a request that read an invitation's status must never write over
 * what another request did to that invitation in between.
 *
 * These tests run the real verify, accept, revoke, resend and create routes
 * against one in-memory invitation table. A test names a call ("the accept
 * route's invitation read") and the request that lands straight after it, so
 * the first request really is holding a stale row when it goes on to write.
 * Reads return copies. A transaction that throws is rolled back, and one
 * account per client and per email is enforced, as the real tables do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => {
  process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

  const invitations: Row[] = [];
  const clientUsers: Row[] = [];
  const clients: Row[] = [];
  const deferred: Array<() => Promise<unknown>> = [];
  const sent: Array<{ to: string; html: string }> = [];
  const email: { failNextWith: null | { name: string; message: string } } = {
    failNextWith: null,
  };
  /** One-shot: the request to run straight after the named call returns. */
  const after = new Map<string, () => Promise<void>>();
  const transactions = { open: 0 };

  async function fire(call: string) {
    const competing = after.get(call);
    if (!competing) return;
    after.delete(call);
    if (transactions.open > 0) {
      throw new Error(
        `fake prisma: ${call} would run another request inside an open transaction`,
      );
    }
    await competing();
  }

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
      if (filter.lt instanceof Date) return (value as Date) < filter.lt;
      if (filter.gt instanceof Date) return (value as Date) > filter.gt;
      throw new Error(`fake prisma: unsupported filter on ${key}`);
    });
  }

  const copy = (row: Row | undefined) => (row ? { ...row } : null);

  const portalInvitation = {
    findMany: async ({ where }: { where: Row }) =>
      invitations.filter((row) => matches(row, where)).map((row) => ({ ...row })),
    findFirst: async ({ where }: { where: Row }) => {
      const found = copy(invitations.find((row) => matches(row, where)));
      await fire("portalInvitation.findFirst");
      return found;
    },
    findUnique: async ({ where }: { where: Row }) => {
      const found = copy(invitations.find((row) => matches(row, where)));
      await fire("portalInvitation.findUnique");
      return found;
    },
    // An unconditional write. Nothing may call it any more; it stays so that
    // code which does is seen overwriting a status, not crashing.
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = invitations.find((candidate) => matches(candidate, where));
      if (!row) throw new Error("fake prisma: no invitation to update");
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = invitations.filter((candidate) => matches(candidate, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    create: async ({ data }: { data: Row }) => {
      const client = clients.find((candidate) => candidate.id === data.clientId);
      const row: Row = {
        id: `inv_created_${invitations.length + 1}`,
        token: "cnewinvitationtokenabcdef",
        status: "PENDING",
        acceptedAt: null,
        createdAt: new Date(),
        ...data,
        client: { name: client?.name, email: client?.email },
        user: {
          name: "Con Tractor",
          businessName: "Acme Restoration",
          organizationId: null,
        },
      };
      invitations.push(row);
      return { ...row };
    },
  };

  const clientUser = {
    findFirst: async ({ where }: { where: Row }) =>
      copy(clientUsers.find((row) => matches(row, where))),
    findUnique: async ({ where }: { where: Row }) => {
      const found = copy(clientUsers.find((row) => matches(row, where)));
      await fire("clientUser.findUnique");
      return found;
    },
    create: async ({ data }: { data: Row }) => {
      const taken = clientUsers.some(
        (row) => row.clientId === data.clientId || row.email === data.email,
      );
      if (taken) {
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
        });
      }
      const row = { id: `client_user_${clientUsers.length + 1}`, ...data };
      clientUsers.push(row);
      return { ...row };
    },
  };

  const client = {
    findFirst: async ({ where }: { where: Row }) =>
      copy(clients.find((row) => matches(row, where))),
  };

  const restore = (table: Row[], snapshot: Row[]) =>
    table.splice(0, table.length, ...snapshot);

  const prisma = {
    portalInvitation,
    clientUser,
    client,
    $transaction: async (work: (tx: unknown) => unknown) => {
      const before = {
        invitations: invitations.map((row) => ({ ...row })),
        clientUsers: clientUsers.map((row) => ({ ...row })),
      };
      transactions.open += 1;
      let result: unknown;
      try {
        result = await work({ portalInvitation, clientUser });
      } catch (error) {
        restore(invitations, before.invitations);
        restore(clientUsers, before.clientUsers);
        throw error;
      } finally {
        transactions.open -= 1;
      }
      await fire("$transaction");
      return result;
    },
  };

  return { invitations, clientUsers, clients, deferred, sent, email, after, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: state.prisma }));
// The public resend hands its write to `after()`: it runs once the response
// has gone. It is held here and run when a test says so.
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
    const failure = state.email.failNextWith;
    state.email.failNextWith = null;
    if (failure) return { error: failure };
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
import { POST as createInvitation } from "@/app/api/portal/invitations/route";
import { DELETE as revokeInvitation } from "@/app/api/portal/invitations/[id]/route";
import { POST as staffResend } from "@/app/api/portal/invitations/[id]/resend/route";
import { POST as acceptInvitation } from "@/app/api/portal/invitations/accept/route";
import { GET as verifyInvitation } from "@/app/api/portal/invitations/verify/route";

const INVITATION_ID = "inv_1";
const TOKEN = "cabcdefghijklmnopqrstuvwx";
const EMAIL = "homeowner@example.com";
const DAY = 24 * 60 * 60 * 1000;
const NOT_YET_LAPSED = new Date(Date.now() + 30 * DAY);
const LAPSED = new Date(Date.now() - DAY);

type Status = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

function seedInvitation(status: Status, expiresAt: Date = NOT_YET_LAPSED) {
  state.invitations.push({
    id: INVITATION_ID,
    token: TOKEN,
    email: EMAIL,
    clientId: "client_1",
    userId: "contractor_1",
    status,
    expiresAt,
    acceptedAt: null,
    createdAt: new Date(Date.now() - 7 * DAY),
    client: { name: "Home Owner", email: EMAIL },
    user: { name: "Con Tractor", businessName: "Acme Restoration", organizationId: null },
  });
}

function seedClient() {
  state.clients.push({
    id: "client_1",
    userId: "contractor_1",
    name: "Home Owner",
    email: EMAIL,
  });
}

const invitation = () => state.invitations[0];

/** Runs `request` straight after the next `call` returns, once. */
function landAfter(call: string, request: () => Promise<unknown>) {
  state.after.set(call, async () => {
    await request();
  });
}

function verify() {
  return verifyInvitation(
    new NextRequest(
      `http://localhost/api/portal/invitations/verify?token=${TOKEN}`,
    ),
  );
}

function accept(token: string = TOKEN) {
  return acceptInvitation(
    new NextRequest("http://localhost/api/portal/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        password: "a-long-enough-password",
        name: "Home Owner",
      }),
    }),
  );
}

function revoke(id: string = INVITATION_ID) {
  return revokeInvitation(
    new NextRequest(`http://localhost/api/portal/invitations/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  );
}

function resendAsStaff() {
  return staffResend(
    new NextRequest(
      `http://localhost/api/portal/invitations/${INVITATION_ID}/resend`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: INVITATION_ID }) },
  );
}

function create() {
  return createInvitation(
    new NextRequest("http://localhost/api/portal/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client_1" }),
    }),
  );
}

/** Runs the work the public resend left for after its response. */
async function resendAsPublic() {
  await requestPortalInvitationResend(EMAIL);
  for (const work of state.deferred.splice(0)) await work();
}

async function expectOk(response: Promise<Response>) {
  expect((await response).status).toBeLessThan(300);
}

beforeEach(() => {
  state.invitations.length = 0;
  state.clientUsers.length = 0;
  state.clients.length = 0;
  state.deferred.length = 0;
  state.sent.length = 0;
  state.email.failNextWith = null;
  state.after.clear();
});

afterEach(() => {
  // A test whose competing request never ran proved nothing.
  expect([...state.after.keys()]).toEqual([]);
});

/**
 * Both public routes mark a lapsed invitation EXPIRED on the way to refusing
 * it. Each must tell the caller "expired" exactly as before, whatever the
 * write did.
 */
const lapsedLinkRoutes = [
  {
    route: "verify",
    open: verify,
    expectExpiredReply: async (response: Response) => {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        valid: false,
        error: "This invitation has expired",
        status: "EXPIRED",
      });
    },
  },
  {
    route: "accept",
    open: () => accept(),
    expectExpiredReply: async (response: Response) => {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invitation has expired" });
    },
  },
];

describe.each(lapsedLinkRoutes)(
  "a lapsed invitation opened through $route",
  ({ open, expectExpiredReply }) => {
    it("is marked expired when nothing else touched it", async () => {
      seedInvitation("PENDING", LAPSED);

      await expectExpiredReply(await open());

      expect(invitation().status).toBe("EXPIRED");
      expect(state.clientUsers).toHaveLength(0);
    });

    it("stays revoked when it was already revoked, so a resend cannot reopen it", async () => {
      seedInvitation("REVOKED", LAPSED);

      await expectExpiredReply(await open());

      expect(invitation().status).toBe("REVOKED");
      expect((await resendAsStaff()).status).toBeGreaterThanOrEqual(400);
      await resendAsPublic();
      expect(invitation().status).toBe("REVOKED");
      expect(state.sent).toHaveLength(0);
    });

    it("stays revoked when the revoke lands after the read", async () => {
      seedInvitation("PENDING", LAPSED);
      landAfter("portalInvitation.findUnique", () => expectOk(revoke()));

      await expectExpiredReply(await open());

      expect(invitation().status).toBe("REVOKED");
      await resendAsPublic();
      expect(invitation().status).toBe("REVOKED");
      expect(state.sent).toHaveLength(0);
    });

    it("stays accepted when a resend and an accept land after the read", async () => {
      seedInvitation("PENDING", LAPSED);
      landAfter("portalInvitation.findUnique", async () => {
        await expectOk(resendAsStaff());
        await expectOk(accept());
      });

      await expectExpiredReply(await open());

      expect(invitation().status).toBe("ACCEPTED");
      expect(invitation().acceptedAt).toBeInstanceOf(Date);
      expect(state.clientUsers).toHaveLength(1);
    });

    it("stays open when a resend lands after the read, and the emailed link works", async () => {
      seedInvitation("PENDING", LAPSED);
      landAfter("portalInvitation.findUnique", () => expectOk(resendAsStaff()));

      await expectExpiredReply(await open());

      expect(invitation().status).toBe("PENDING");
      expect((invitation().expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
      expect(state.sent).toHaveLength(1);
      expect((await accept()).status).toBe(201);
      expect(invitation().status).toBe("ACCEPTED");
    });
  },
);

describe("accepting an invitation", () => {
  it("creates the account and marks the invitation accepted", async () => {
    seedInvitation("PENDING");

    const response = await accept();

    expect(response.status).toBe(201);
    expect((await response.json()).token).toEqual(expect.any(String));
    expect(invitation().status).toBe("ACCEPTED");
    expect(invitation().acceptedAt).toBeInstanceOf(Date);
    expect(state.clientUsers).toHaveLength(1);
  });

  it.each(["portalInvitation.findUnique", "clientUser.findUnique"])(
    "creates no account when a revoke lands after %s",
    async (call) => {
      seedInvitation("PENDING");
      landAfter(call, () => expectOk(revoke()));

      const response = await accept();

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invitation has been revoked",
      });
      expect(invitation().status).toBe("REVOKED");
      expect(invitation().acceptedAt).toBeNull();
      expect(state.clientUsers).toHaveLength(0);
    },
  );

  it("lets only one of two simultaneous accepts win", async () => {
    seedInvitation("PENDING");
    landAfter("clientUser.findUnique", () => expectOk(accept()));

    const response = await accept();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invitation already accepted",
    });
    expect(invitation().status).toBe("ACCEPTED");
    expect(state.clientUsers).toHaveLength(1);
  });

  it("refuses as expired when the invitation lapses and is marked expired after the read", async () => {
    seedInvitation("PENDING");
    landAfter("clientUser.findUnique", async () => {
      // The clock passes the expiry, then another visitor opens the link.
      invitation().expiresAt = LAPSED;
      await verify();
    });

    const response = await accept();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invitation has expired" });
    expect(invitation().status).toBe("EXPIRED");
    expect(state.clientUsers).toHaveLength(0);
  });

  it("answers as an invalid link when the invitation is deleted after the read", async () => {
    seedInvitation("PENDING");
    landAfter("clientUser.findUnique", async () => {
      // The contractor deletes the client; its invitations go with it.
      state.invitations.length = 0;
    });

    const response = await accept();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Invalid invitation token" });
    expect(state.clientUsers).toHaveLength(0);
  });

  it("asks for another try when the invitation expires and is resent while the accept is losing", async () => {
    seedInvitation("PENDING");
    landAfter("clientUser.findUnique", async () => {
      // The clock passes the expiry, then another visitor opens the link.
      invitation().expiresAt = LAPSED;
      await verify();
    });
    // The contractor resends it after the accept has lost, before its reply is chosen.
    landAfter("$transaction", () => expectOk(resendAsStaff()));

    const response = await accept();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This invitation changed while it was being accepted. Try again.",
    });
    expect(invitation().status).toBe("PENDING");
    expect(invitation().acceptedAt).toBeNull();
    expect(state.clientUsers).toHaveLength(0);
  });

  it("leaves the invitation open when the account cannot be created", async () => {
    seedInvitation("PENDING");
    // Another client's account already uses this email address.
    state.clientUsers.push({
      id: "client_user_other",
      clientId: "client_other",
      email: EMAIL,
    });

    const response = await accept();

    expect(response.status).toBe(500);
    expect(invitation().status).toBe("PENDING");
    expect(invitation().acceptedAt).toBeNull();
    expect(state.clientUsers).toHaveLength(1);
  });
});

describe("revoking an invitation", () => {
  it.each(["PENDING", "EXPIRED"] as const)("revokes a %s invitation", async (status) => {
    seedInvitation(status);

    const response = await revoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: INVITATION_ID, status: "REVOKED" },
    });
    expect(invitation().status).toBe("REVOKED");
  });

  it("does not overwrite an accept that lands after the read", async () => {
    seedInvitation("PENDING");
    landAfter("portalInvitation.findFirst", () => expectOk(accept()));

    const response = await revoke();

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe(
      "Cannot revoke an invitation that was already accepted",
    );
    expect(invitation().status).toBe("ACCEPTED");
    expect(state.clientUsers).toHaveLength(1);
  });

  it("answers as already revoked when another revoke lands after the read", async () => {
    seedInvitation("PENDING");
    landAfter("portalInvitation.findFirst", () => expectOk(revoke()));

    const response = await revoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: INVITATION_ID, status: "REVOKED" },
    });
    expect(invitation().status).toBe("REVOKED");
  });
});

describe("creating an invitation", () => {
  it("emails the link and answers 201", async () => {
    seedClient();

    const response = await create();

    expect(response.status).toBe(201);
    expect((await response.json()).emailSent).toBe(true);
    expect(invitation().status).toBe("PENDING");
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].html).toContain(`token=${invitation().token}`);
  });

  it.each([
    {
      landed: "revoked",
      competing: () => revoke(invitation().id as string),
      status: "REVOKED",
    },
    {
      landed: "accepted",
      competing: () => accept(invitation().token as string),
      status: "ACCEPTED",
    },
  ])(
    "answers 409 with no token and no email when it is $landed before the email write",
    async ({ competing, status }) => {
      seedClient();
      landAfter("$transaction", () => expectOk(competing()));

      const response = await create();

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("CONFLICT");
      expect(body.reason).toBe("invitation_not_open");
      expect(body.emailSent).toBe(false);
      expect(body.invitation).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(invitation().token as string);
      expect(invitation().status).toBe(status);
      expect(state.sent).toHaveLength(0);
    },
  );

  it("still answers 502 when the email provider fails", async () => {
    seedClient();
    state.email.failNextWith = { name: "provider_error", message: "Mail is down" };

    const response = await create();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.emailSent).toBe(false);
    expect(invitation().status).toBe("PENDING");
  });
});
