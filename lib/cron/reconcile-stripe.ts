import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { downgradeUserToCanceled } from "@/app/api/webhooks/stripe/route";
import {
  TECHNICIAN_SEATS_ADDON_SUBSCRIPTION_TYPE,
  TECHNICIAN_SEATS_SKU,
} from "@/lib/billing/technician-seats-addon";
import type { CronJobResult } from "./runner";
import { forEachPage } from "./for-each-page";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compares what Stripe bills for technician seats with what the app counts. A
 * customer who paid and has no usable seat otherwise only surfaces when they
 * complain. Reports only: healing stays with the webhook and the in-app sync.
 */
async function reconcileSeats(): Promise<{
  seatMismatches: number;
  paidSeatsWithNoRow: number;
  seatsErrored: number;
  seatsTruncated: boolean;
}> {
  let seatMismatches = 0;
  let seatsErrored = 0;
  const known = new Set<string>();
  const entitlementRead = await forEachPage(
    "reconcile-stripe:seat-entitlements",
    (page) =>
      prisma.featureEntitlement.findMany({
        ...page,
        where: {
          sku: TECHNICIAN_SEATS_SKU,
          active: true,
          stripeSubscriptionId: { not: null },
          ...page.where,
        },
        select: { id: true, seats: true, stripeSubscriptionId: true },
      }),
    async (rows) => {
      for (const row of rows) {
        const subscriptionId = row.stripeSubscriptionId;
        if (!subscriptionId) continue;
        known.add(subscriptionId);
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if ((sub.items.data[0]?.quantity ?? 0) !== (row.seats ?? 0)) {
            seatMismatches++;
            console.error(
              `[cron/reconcile-stripe] seat count differs on entitlement ${row.id}, subscription ${subscriptionId}`,
            );
          }
        } catch (err: unknown) {
          seatsErrored++;
          console.error(
            `[cron/reconcile-stripe] Failed to read seat subscription ${subscriptionId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    },
  );

  let paidSeatsWithNoRow = 0;
  const customerRead = await forEachPage(
    "reconcile-stripe:seat-customers",
    (page) =>
      prisma.user.findMany({
        ...page,
        where: {
          // Seats can be bought during a trial, before the plan.
          subscriptionStatus: { in: ["ACTIVE", "TRIAL"] },
          stripeCustomerId: { not: null },
          ...page.where,
        },
        select: { id: true, stripeCustomerId: true },
      }),
    async (customers) => {
      for (const customer of customers) {
        if (!customer.stripeCustomerId) continue;
        try {
          const listed = await stripe.subscriptions.list({
            customer: customer.stripeCustomerId,
            status: "active",
            limit: 100,
          });
          for (const sub of listed.data) {
            if (
              sub.metadata?.type === TECHNICIAN_SEATS_ADDON_SUBSCRIPTION_TYPE &&
              !known.has(sub.id)
            ) {
              paidSeatsWithNoRow++;
              console.error(
                `[cron/reconcile-stripe] paid seat subscription ${sub.id} has no entitlement row, user ${customer.id}`,
              );
            }
          }
        } catch (err: unknown) {
          seatsErrored++;
          console.error(
            `[cron/reconcile-stripe] Failed to list subscriptions for user ${customer.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    },
  );

  return {
    seatMismatches,
    paidSeatsWithNoRow,
    seatsErrored,
    seatsTruncated: entitlementRead.truncated || customerRead.truncated,
  };
}

/**
 * Stripe reconciliation safety net — RA-6939.
 *
 * The `customer.subscription.deleted` webhook can miss its user (or never
 * arrive). This cron closes that gap: for every locally-active subscription it
 * asks Stripe for the real status and, when Stripe reports the subscription
 * canceled or deleted, applies the same downgrade `handleSubscriptionDeleted`
 * uses (downgradeUserToCanceled) so the user loses premium access.
 *
 * It also fails the run on a seat mismatch, because a failed run is what the
 * cron watchdog can see.
 *
 * Runs: /api/cron/reconcile-stripe.
 */
export async function reconcileStripe(): Promise<CronJobResult> {
  let downgraded = 0;
  let errored = 0;

  const activeRead = await forEachPage(
    "reconcile-stripe:active-subscribers",
    (page) =>
      prisma.user.findMany({
        ...page,
        where: {
          subscriptionStatus: "ACTIVE",
          subscriptionId: { not: null },
          ...page.where,
        },
        select: { id: true, subscriptionId: true },
      }),
    async (active) => {
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
    },
  );

  const seats = await reconcileSeats();
  // Owners who finished terms a day ago and still have no business are stalled
  // on the setup path. Counted for the run record; a non-zero count is not a
  // billing fault, so it does not fail the run.
  const ownersWithNoOrganisation = await prisma.user.count({
    where: {
      role: "ADMIN",
      organizationId: null,
      pendingInviteIdentity: false,
      needsOnboarding: false,
      createdAt: { lt: new Date(Date.now() - DAY_MS) },
    },
  });

  const unmatched = seats.seatMismatches + seats.paidSeatsWithNoRow;
  if (unmatched > 0) {
    throw new Error(
      `Technician seat mismatch: ${seats.seatMismatches} differ from Stripe, ${seats.paidSeatsWithNoRow} paid with no row`,
    );
  }

  return {
    itemsProcessed: downgraded,
    metadata: {
      candidates: activeRead.rowsRead,
      downgraded,
      errored,
      ...seats,
      ownersWithNoOrganisation,
      truncated: activeRead.truncated || seats.seatsTruncated,
    },
  };
}
