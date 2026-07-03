import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/webhooks/logs/[id]/retry
 *
 * Re-queues a FAILED webhook event by resetting its status to PENDING.
 * The event will be picked up on the next cron run (/api/webhooks/process).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: stops retryCount from double-incrementing on a double-click.
  return withIdempotency(request, userId, async () => {
    try {
      const webhookEvent = await prisma.webhookEvent.findFirst({
        where: {
          id,
          integration: { userId },
        },
      });

      if (!webhookEvent) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Webhook event not found",
          status: 404,
        });
      }

      if (webhookEvent.status !== "FAILED") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Only FAILED events can be retried",
          status: 400,
        });
      }

      const updated = await prisma.webhookEvent.update({
        where: { id },
        data: {
          status: "PENDING",
          retryCount: 0,
          errorMessage: null,
          processedAt: null,
        },
      });

      return NextResponse.json({ success: true, event: updated });
    } catch (error) {
      return fromException(request, error, { stage: "webhook-retry" });
    }
  });
}
