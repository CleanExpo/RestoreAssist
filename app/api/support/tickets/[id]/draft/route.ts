import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { withIdempotency } from "@/lib/idempotency";
import { draftSupportTicketReply } from "@/lib/services/ai/draft-support-ticket";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// POST /api/support/tickets/[id]/draft — admin only
// Regenerates a Claude response draft for the given ticket.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const userId = session!.user!.id;
  const { id } = await context.params;

  // RA-1266: regenerating a draft hits Claude Haiku — idempotency spares
  // the duplicate API cost + latency when the admin double-clicks.
  return withIdempotency(request, userId, async () => {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id },
        select: {
          id: true,
          subject: true,
          body: true,
          category: true,
          priority: true,
        },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: "Ticket not found" },
          { status: 404 },
        );
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error("[SupportTicketDraft]", "ANTHROPIC_API_KEY not set");
        return NextResponse.json(
          { error: "AI service not configured" },
          { status: 500 },
        );
      }

      const result = await draftSupportTicketReply({
        apiKey,
        ticket: {
          category: ticket.category,
          priority: ticket.priority,
          subject: ticket.subject,
          body: ticket.body,
        },
      });

      if (!result.ok) {
        console.error("[SupportTicketDraft]", {
          ticketId: id,
          reason: result.reason,
          detail: result.detail,
        });
        const status =
          result.reason === "KEY_MISSING"
            ? 500 // platform-key not configured — operator problem, not user
            : result.reason === "RATE_LIMITED"
              ? 429
              : result.reason === "MODEL_OVERLOADED"
                ? 503
                : result.reason === "EMPTY_OUTPUT"
                  ? 502
                  : 500;
        const headers: Record<string, string> =
          result.retryAfterMs != null
            ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
            : {};
        return NextResponse.json(
          { error: result.reason },
          { status, headers },
        );
      }

      const responseDraft = result.data;

      await prisma.supportTicket.update({
        where: { id },
        data: { responseDraft },
      });

      return NextResponse.json({ responseDraft });
    } catch (error) {
      console.error("[support/tickets/[id]/draft POST]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
