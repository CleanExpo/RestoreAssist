import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IntegrationProvider, WebhookEventStatus } from "@prisma/client";

/**
 * GET /api/webhooks/logs
 *
 * Paginated webhook event log for the authenticated user's integrations.
 *
 * Query params:
 *   page     - page number (default 1)
 *   limit    - results per page (default 20, max 100)
 *   provider - filter by IntegrationProvider (XERO | QUICKBOOKS | MYOB | SERVICEM8 | ASCORA)
 *   status   - filter by WebhookEventStatus (PENDING | PROCESSING | PROCESSED | FAILED | IGNORED)
 *   from     - ISO date string — earliest createdAt
 *   to       - ISO date string — latest createdAt
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
    );
    const providerParam = searchParams.get("provider");
    const statusParam = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Only show events belonging to integrations owned by this user
    const where: Record<string, unknown> = {
      integration: {
        userId: session.user.id,
      },
    };

    if (
      providerParam &&
      Object.values(IntegrationProvider).includes(
        providerParam as IntegrationProvider,
      )
    ) {
      where.provider = providerParam as IntegrationProvider;
    }

    if (
      statusParam &&
      Object.values(WebhookEventStatus).includes(
        statusParam as WebhookEventStatus,
      )
    ) {
      where.status = statusParam as WebhookEventStatus;
    }

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        include: {
          integration: {
            select: { provider: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.webhookEvent.count({ where }),
    ]);

    return NextResponse.json({
      events,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Webhook Logs] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhook events" },
      { status: 500 },
    );
  }
}
