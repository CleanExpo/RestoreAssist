import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";
import { fromException } from "@/lib/api-errors";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/admin/stripe-diagnostics
 *
 * Platform-staff only. These are RestoreAssist's own Stripe webhook
 * events and secret-shape flags, not a tenant's. `role: "ADMIN"` is
 * every self-registered owner; `PLATFORM_SUPPORT_USER_IDS` is the staff
 * allowlist (`isPlatformSupportOperator`, RA-7595 / RA-7592 / RA-7566).
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
    // Tenant ADMIN is not RestoreAssist staff. Fail closed before any
    // platform Stripe read or env-shape flag is materialised.
    if (!auth.user || !isPlatformSupportOperator(auth.user.id)) {
      return forbidden();
    }

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
        processing: countsByStatus.PROCESSING ?? 0,
        completed: countsByStatus.COMPLETED ?? 0,
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
    return fromException(_request, error, { stage: "stripe-diagnostics" });
  }
}
