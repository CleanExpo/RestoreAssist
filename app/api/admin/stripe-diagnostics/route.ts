import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";

/**
 * GET /api/admin/stripe-diagnostics
 *
 * Admin-only. Returns recent Stripe webhook events and environment-shape
 * signals so a real human can verify the subscription pipe is healthy
 * without having to tail Vercel logs.
 *
 * Shape:
 *   {
 *     env: { hasSecretKey, hasWebhookSecret, nextAuthUrl, nodeEnv },
 *     recentEvents: [{ id, type, status, processedAt, errorMessage }],
 *     counts: { pending, processed, skipped, failed },
 *     lastEvent: { receivedAt, type } | null
 *   }
 *
 * No secret values are returned — only whether each is set.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const [recentEvents, counts] = await Promise.all([
      prisma.stripeWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          stripeEventId: true,
          eventType: true,
          status: true,
          processedAt: true,
          errorMessage: true,
          retryCount: true,
          createdAt: true,
        },
      }),
      prisma.stripeWebhookEvent.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    const countsByStatus = counts.reduce(
      (acc, row) => {
        acc[row.status] = row._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    return NextResponse.json({
      env: {
        hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasStripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        nextAuthUrl: process.env.NEXTAUTH_URL ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      counts: {
        pending: countsByStatus.PENDING ?? 0,
        processed: countsByStatus.PROCESSED ?? 0,
        skipped: countsByStatus.SKIPPED ?? 0,
        failed: countsByStatus.FAILED ?? 0,
      },
      lastEvent: recentEvents[0]
        ? {
            receivedAt: recentEvents[0].createdAt,
            type: recentEvents[0].eventType,
            status: recentEvents[0].status,
          }
        : null,
      recentEvents,
      instructions: {
        noEventsEver:
          "If counts are all 0, Stripe isn't reaching this endpoint. Confirm webhook URL is registered in Stripe Dashboard and points to /api/webhooks/stripe on this deploy.",
        allFailed:
          "If most events are FAILED with 'Invalid signature', STRIPE_WEBHOOK_SECRET on this environment does not match the signing secret Stripe is sending. Copy the environment-specific secret from Stripe Dashboard.",
        skippedIsFine:
          "SKIPPED events are retries of already-processed events — harmless.",
      },
    });
  } catch (error) {
    console.error("[admin/stripe-diagnostics] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
