import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";
import { sendSupportReplyEmail } from "@/lib/email";
import { deliverEmailOnce, EmailDeliveryPending } from "@/lib/email-delivery-ledger";
import { createHash } from "node:crypto";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Validation schema for POST
// ---------------------------------------------------------------------------

const replySchema = z.object({
  // The reply text — typically the accepted/edited AI draft.
  message: z
    .string()
    .min(1, "Reply message is required")
    .max(10000, "Reply message is too long"),
  // Status to move the ticket to after the reply is sent. Defaults to
  // "resolved" — replying is normally the resolving action.
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/support/tickets/[id]/reply — admin only (RA-6936)
//
// Emails the reply to the ticket requester, persists it on the ticket, and
// updates the ticket status. Order matters: the email is sent FIRST — if it
// fails, nothing is persisted and the admin gets a clear 502 so the customer
// is never marked "replied to" without actually receiving anything.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = replySchema.safeParse(rawBody);
    if (!parsed.success) {
      // Matches the sibling PATCH idiom (RA-1548): rich 422 with `issues`.
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, subject: true },
    });

    if (!ticket) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Ticket not found",
        status: 404,
      });
    }

    const { message } = parsed.data;
    const nextStatus = parsed.data.status ?? "resolved";
    const requestKey = request.headers.get("idempotency-key")?.trim();
    if (!requestKey || requestKey.length > 200) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Idempotency-Key is required",
        status: 400,
      });
    }
    const deliveryKey = `support-reply:${ticket.id}:${requestKey}`;
    const priorReply = await prisma.supportTicketReply.findUnique({
      where: { deliveryKey },
      include: { ticket: true },
    });
    if (priorReply) {
      if (priorReply.body !== message || priorReply.ticketStatus !== nextStatus) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Idempotency-Key was already used for another reply payload",
          status: 409,
        });
      }
      return NextResponse.json({
        reply: priorReply,
        ticket: priorReply.ticket,
        replayed: true,
      });
    }

    // Send first — persist only after the customer actually got the email.
    try {
      const replyHash = createHash("sha256").update(message).digest("hex");
      await deliverEmailOnce({
        idempotencyKey: deliveryKey,
        kind: "SUPPORT_TICKET_REPLY",
        recipient: ticket.email,
        payloadIdentity: `${ticket.id}|${replyHash}|${nextStatus}`,
        send: () =>
          sendSupportReplyEmail({
            recipientEmail: ticket.email,
            recipientName: ticket.name,
            ticketSubject: ticket.subject,
            replyBody: message,
            idempotencyKey: deliveryKey,
          }),
      });
    } catch (err) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message:
          "The reply email could not be sent, so the reply was not recorded. Please try again.",
        status: err instanceof EmailDeliveryPending ? 409 : 502,
        err,
        stage: "reply-send",
      });
    }

    const resolvedAt =
      nextStatus === "resolved"
        ? new Date()
        : nextStatus === "open" || nextStatus === "in_progress"
          ? null
          : undefined;

    const [reply, updatedTicket] = await prisma.$transaction([
      prisma.supportTicketReply.create({
        data: {
          ticketId: ticket.id,
          deliveryKey,
          ticketStatus: nextStatus,
          body: message,
          sentToEmail: ticket.email,
          sentById: auth.user!.id,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        },
      }),
    ]);

    return NextResponse.json({ reply, ticket: updatedTicket });
  } catch (error) {
    return fromException(request, error, { stage: "reply" });
  }
}
