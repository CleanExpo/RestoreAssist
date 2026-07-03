/**
 * Shared one-time (payment-mode) fulfillment — F4 (RA-6929/6930/6931).
 *
 * Lifetime and addon-pack purchases are one-time Stripe payments (mode:
 * "payment"), which do NOT emit subscription events. Historically they were
 * fulfilled ONLY when the buyer's browser returned to the success page and
 * called a verify endpoint — pay then close the tab and money was taken with
 * nothing delivered.
 *
 * These helpers are the single source of fulfillment truth, called by BOTH the
 * Stripe webhook `checkout.session.completed` handler (the primary, browser-
 * independent path) AND the browser verify endpoints (a redundant self-heal).
 *
 * Idempotency (replay-safe, cross-path):
 *  - Lifetime writes are ABSOLUTE (lifetimeAccess=true, plan="Lifetime", …), so
 *    applying the same session any number of times converges to one state.
 *  - Addon credits are an INCREMENT, so they dedupe on the existing
 *    `AddonPurchase.stripeSessionId @unique` marker — the same checkout session
 *    credits reports exactly once regardless of which path (webhook or verify)
 *    processes it first.
 */

import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import type Stripe from "stripe";

export interface FulfillResult {
  /** True when THIS call performed the provisioning write. */
  applied: boolean;
  /** True when the session was already fulfilled (idempotent no-op). */
  deduped?: boolean;
  /** Set when nothing was applied because the session data was unusable. */
  reason?: string;
}

/**
 * Grant lifetime access from a one-time checkout session. Idempotent by
 * construction (absolute writes). Keyed on `session.metadata.userId`.
 */
export async function fulfillLifetimeFromSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const userId = session.metadata?.userId;
  if (!userId) return { applied: false, reason: "missing userId metadata" };

  const customerId =
    typeof session.customer === "string" ? session.customer : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      lifetimeAccess: true,
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Lifetime",
      creditsRemaining: 999999,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });

  return { applied: true };
}

/**
 * Credit an addon report pack from a one-time checkout session. Idempotent via
 * the `AddonPurchase.stripeSessionId @unique` cross-path marker. Keyed on
 * `session.metadata.userId` + `session.metadata.addonKey` / `addonReports`.
 */
export async function fulfillAddonFromSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const userId = session.metadata?.userId;
  if (!userId) return { applied: false, reason: "missing userId metadata" };

  const addonKey = session.metadata?.addonKey;
  const addonReports = parseInt(session.metadata?.addonReports || "0", 10);
  const addon = addonKey
    ? PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]
    : undefined;

  if (!addonKey || !addon || !Number.isFinite(addonReports) || addonReports <= 0) {
    return { applied: false, reason: "invalid addon metadata" };
  }

  // Cross-path idempotency marker: the same session must credit exactly once
  // whether the webhook or the browser verify endpoint runs first.
  const existing = await prisma.addonPurchase.findFirst({
    where: { stripeSessionId: session.id },
    select: { id: true },
  });
  if (existing) return { applied: false, deduped: true };

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : undefined;

  try {
    // Atomic: create the purchase record + increment the credit in one txn so a
    // crash between them can't leave a marker with no credit (or vice-versa).
    await prisma.$transaction([
      prisma.addonPurchase.create({
        data: {
          userId,
          addonKey,
          addonName: addon.name,
          reportLimit: addonReports,
          amount: addon.amount,
          currency: addon.currency,
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          status: "COMPLETED",
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { addonReports: { increment: addonReports } },
      }),
    ]);
    return { applied: true };
  } catch (err: unknown) {
    // Unique constraint on stripeSessionId — another path already fulfilled it.
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message ?? "";
    if (code === "P2002" || /unique/i.test(message)) {
      return { applied: false, deduped: true };
    }
    throw err;
  }
}
