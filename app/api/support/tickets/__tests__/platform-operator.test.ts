/**
 * RA-7647 — support tickets are RestoreAssist staff work.
 *
 * Every self-signup is given role ADMIN (app/api/auth/register/route.ts), so
 * `verifyAdminFromDb` alone admits every trial business. Without the
 * PLATFORM_SUPPORT_USER_IDS allowlist a trial user could read every
 * business's tickets and send free text from RestoreAssist's own address.
 *
 * `@/lib/admin-auth` is deliberately NOT mocked: the real `verifyAdminFromDb`
 * reads the mocked `prisma.user.findUnique`, and the real
 * `verifyPlatformSupportOperator` reads the stubbed environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const ticketFindMany = vi.fn();
const ticketCount = vi.fn();
const ticketFindUnique = vi.fn();
const ticketUpdate = vi.fn();
const ticketCreate = vi.fn();
const replyFindUnique = vi.fn();
const replyCreate = vi.fn();
const transaction = vi.fn();
const sendSupportReplyEmail = vi.fn();
const draftSupportTicketReply = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    supportTicket: {
      findMany: (...args: unknown[]) => ticketFindMany(...args),
      count: (...args: unknown[]) => ticketCount(...args),
      findUnique: (...args: unknown[]) => ticketFindUnique(...args),
      update: (...args: unknown[]) => ticketUpdate(...args),
      create: (...args: unknown[]) => ticketCreate(...args),
    },
    supportTicketReply: {
      findUnique: (...args: unknown[]) => replyFindUnique(...args),
      create: (...args: unknown[]) => replyCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/services/ai/analyse-support-ticket", () => ({
  analyseSupportTicket: vi.fn(),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: vi.fn(),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/email", () => ({
  sendSupportReplyEmail: (...args: unknown[]) => sendSupportReplyEmail(...args),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  EmailDeliveryPending: class EmailDeliveryPending extends Error {},
  deliverEmailOnce: ({ send }: { send: () => Promise<unknown> }) => send(),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    _request: NextRequest,
    _scope: string,
    handler: () => Promise<Response>,
  ) => handler(),
}));
vi.mock("@/lib/services/ai/draft-support-ticket", () => ({
  draftSupportTicketReply: (...args: unknown[]) =>
    draftSupportTicketReply(...args),
}));

import { GET as listTickets, POST as submitTicket } from "../route";
import { GET as getTicket, PATCH as patchTicket } from "../[id]/route";
import { POST as replyToTicket } from "../[id]/reply/route";
import { POST as draftReply } from "../[id]/draft/route";

const ctx = { params: Promise.resolve({ id: "ticket_1" }) };

function signInTenantAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN", name: "Trial Owner" },
  });
  userFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    organizationId: "org-trial",
  });
}

function json(url: string, method: string, body: unknown, headers = {}) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  signInTenantAdmin();
  ticketFindMany.mockResolvedValue([{ id: "ticket_1" }]);
  ticketCount.mockResolvedValue(1);
  ticketFindUnique.mockResolvedValue({
    id: "ticket_1",
    email: "customer@example.com",
    name: "Casey Customer",
    subject: "Cannot export my report",
    body: "Please help",
    category: "technical",
    priority: "normal",
  });
  ticketUpdate.mockResolvedValue({ id: "ticket_1", status: "resolved" });
  ticketCreate.mockImplementation(async ({ data }: { data: object }) => ({
    id: "ticket_new",
    ...data,
  }));
  replyFindUnique.mockResolvedValue(null);
  replyCreate.mockReturnValue("create-op");
  transaction.mockResolvedValue([
    { id: "reply_1", body: "All sorted." },
    { id: "ticket_1", status: "resolved" },
  ]);
  sendSupportReplyEmail.mockResolvedValue({ data: { id: "email_1" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a tenant ADMIN who is not RestoreAssist staff (RA-7647)", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "someone-else");
  });

  it("cannot list every business's tickets", async () => {
    const res = await listTickets(
      new NextRequest("http://localhost/api/support/tickets"),
    );
    expect(res.status).toBe(403);
    expect(ticketFindMany).not.toHaveBeenCalled();
    expect(ticketCount).not.toHaveBeenCalled();
  });

  it("cannot open a ticket", async () => {
    const res = await getTicket(
      new NextRequest("http://localhost/api/support/tickets/ticket_1"),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(ticketFindUnique).not.toHaveBeenCalled();
  });

  it("cannot change a ticket", async () => {
    const res = await patchTicket(
      json("http://localhost/api/support/tickets/ticket_1", "PATCH", {
        status: "closed",
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it("cannot send a reply from RestoreAssist's address", async () => {
    const res = await replyToTicket(
      json(
        "http://localhost/api/support/tickets/ticket_1/reply",
        "POST",
        { message: "Click this link to verify your account" },
        { "Idempotency-Key": "k1" },
      ),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cannot regenerate an AI draft", async () => {
    const res = await draftReply(
      new NextRequest("http://localhost/api/support/tickets/ticket_1/draft", {
        method: "POST",
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(draftSupportTicketReply).not.toHaveBeenCalled();
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it("is refused when the allowlist is unset (fails closed)", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    const res = await listTickets(
      new NextRequest("http://localhost/api/support/tickets"),
    );
    expect(res.status).toBe(403);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it("can still submit a ticket through the public form", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await submitTicket(
      json("http://localhost/api/support/tickets", "POST", {
        name: "Jane Restorer",
        email: "jane@example.com",
        subject: "Website contact enquiry",
        body: "I would like to trial RestoreAssist for my business.",
      }),
    );
    expect(res.status).toBe(201);
    expect(ticketCreate).toHaveBeenCalledTimes(1);
  });
});

describe("an allowlisted RestoreAssist staff ADMIN (RA-7647)", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");
  });

  it("lists tickets", async () => {
    const res = await listTickets(
      new NextRequest("http://localhost/api/support/tickets"),
    );
    expect(res.status).toBe(200);
    expect(ticketFindMany).toHaveBeenCalledTimes(1);
  });

  it("opens and updates a ticket", async () => {
    const opened = await getTicket(
      new NextRequest("http://localhost/api/support/tickets/ticket_1"),
      ctx,
    );
    expect(opened.status).toBe(200);

    const patched = await patchTicket(
      json("http://localhost/api/support/tickets/ticket_1", "PATCH", {
        status: "closed",
      }),
      ctx,
    );
    expect(patched.status).toBe(200);
    expect(ticketUpdate).toHaveBeenCalledTimes(1);
  });

  it("sends a reply", async () => {
    const res = await replyToTicket(
      json(
        "http://localhost/api/support/tickets/ticket_1/reply",
        "POST",
        { message: "All sorted." },
        { "Idempotency-Key": "k1" },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(sendSupportReplyEmail).toHaveBeenCalledTimes(1);
  });
});
