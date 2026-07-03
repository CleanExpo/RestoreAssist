import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const supportTicketFindUnique = vi.fn();
const supportTicketUpdate = vi.fn();
const supportTicketReplyCreate = vi.fn();
const transaction = vi.fn();
const sendSupportReplyEmail = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      findUnique: (...args: unknown[]) => supportTicketFindUnique(...args),
      update: (...args: unknown[]) => supportTicketUpdate(...args),
    },
    supportTicketReply: {
      create: (...args: unknown[]) => supportTicketReplyCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));
vi.mock("@/lib/email", () => ({
  sendSupportReplyEmail: (...args: unknown[]) => sendSupportReplyEmail(...args),
}));
// Pass-through — retry/backoff semantics are covered by email-retry itself.
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: (send: () => Promise<unknown>) => send(),
}));

import { POST } from "../route";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/support/tickets/ticket_1/reply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const routeContext = { params: Promise.resolve({ id: "ticket_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  supportTicketFindUnique.mockReset();
  supportTicketUpdate.mockReset();
  supportTicketReplyCreate.mockReset();
  transaction.mockReset();
  sendSupportReplyEmail.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    user: { id: "admin_user", role: "ADMIN", organizationId: null },
  });
  supportTicketFindUnique.mockResolvedValue({
    id: "ticket_1",
    email: "customer@example.com",
    name: "Casey Customer",
    subject: "Cannot export my report",
  });
  sendSupportReplyEmail.mockResolvedValue({ data: { id: "email_1" }, error: null });
  supportTicketReplyCreate.mockReturnValue("create-op");
  supportTicketUpdate.mockReturnValue("update-op");
  transaction.mockResolvedValue([
    { id: "reply_1", ticketId: "ticket_1", body: "All sorted." },
    { id: "ticket_1", status: "resolved" },
  ]);
});

describe("POST /api/support/tickets/[id]/reply", () => {
  it("returns the auth response when the caller is not an admin", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(postRequest({ message: "hello" }), routeContext);

    expect(response.status).toBe(403);
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket does not exist", async () => {
    supportTicketFindUnique.mockResolvedValue(null);

    const response = await POST(postRequest({ message: "hello" }), routeContext);

    expect(response.status).toBe(404);
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();
  });

  it("returns 422 when the message is empty", async () => {
    const response = await POST(postRequest({ message: "" }), routeContext);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Validation failed");
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();
  });

  it("emails the requester, persists the reply, and resolves the ticket", async () => {
    const response = await POST(
      postRequest({ message: "All sorted." }),
      routeContext,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sendSupportReplyEmail).toHaveBeenCalledWith({
      recipientEmail: "customer@example.com",
      recipientName: "Casey Customer",
      ticketSubject: "Cannot export my report",
      replyBody: "All sorted.",
    });
    expect(supportTicketReplyCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket_1",
        body: "All sorted.",
        sentToEmail: "customer@example.com",
        sentById: "admin_user",
      },
    });
    expect(supportTicketUpdate).toHaveBeenCalledWith({
      where: { id: "ticket_1" },
      data: {
        status: "resolved",
        resolvedAt: expect.any(Date),
      },
    });
    expect(body.reply.id).toBe("reply_1");
    expect(body.ticket.status).toBe("resolved");
  });

  it("honours a status override and clears resolvedAt for in_progress", async () => {
    await POST(
      postRequest({ message: "Looking into it now.", status: "in_progress" }),
      routeContext,
    );

    expect(supportTicketUpdate).toHaveBeenCalledWith({
      where: { id: "ticket_1" },
      data: {
        status: "in_progress",
        resolvedAt: null,
      },
    });
  });

  it("returns 502 and persists nothing when the email cannot be sent", async () => {
    sendSupportReplyEmail.mockRejectedValue(
      new Error("[email] Resend send failed (support-reply)"),
    );

    const response = await POST(
      postRequest({ message: "All sorted." }),
      routeContext,
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(transaction).not.toHaveBeenCalled();
    expect(supportTicketReplyCreate).not.toHaveBeenCalled();
    expect(supportTicketUpdate).not.toHaveBeenCalled();
  });
});
