import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { downgradeUserToCanceled } from "@/app/api/webhooks/stripe/route";
import type { CronJobResult } from "./runner";

/**
 * Stripe reconciliation safety net — RA-6939.
 *
 * The `customer.subscription.deleted` webhook can miss its user (or never
 * arrive). This cron closes that gap: for every locally-active subscription it
 * asks Stripe for the real status and, when Stripe reports the subscription
 * canceled or deleted, applies the same downgrade `handleSubscriptionDeleted`
 * uses (downgradeUserToCanceled) so the user loses premium access.
 *
 * Runs: /api/cron/reconcile-stripe.
 */
export async function reconcileStripe(): Promise<CronJobResult> {
  const active = await prisma.user.findMany({
    where: {
      subscriptionStatus: "ACTIVE",
      subscriptionId: { not: null },
    },
    select: { id: true, subscriptionId: true },
    take: 1000,
  });

  let downgraded = 0;
  let errored = 0;

  for (const user of active) {
    if (!user.subscriptionId) continue;

    try {
      const sub = await stripe.subscriptions.retrieve(user.subscriptionId);
      if (sub.status === "canceled") {
        await downgradeUserToCanceled(user.id);
        downgraded++;
      }
    } catch (err: unknown) {
      // A deleted subscription returns resource_missing — Stripe no longer
      // knows it, so treat it as canceled and downgrade. Any other error is
      // logged and skipped (retried next run).
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "resource_missing"
      ) {
        await downgradeUserToCanceled(user.id);
        downgraded++;
      } else {
        errored++;
        console.error(
          `[cron/reconcile-stripe] Failed to reconcile user ${user.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return {
    itemsProcessed: downgraded,
    metadata: {
      candidates: active.length,
      downgraded,
      errored,
    },
  };
}
