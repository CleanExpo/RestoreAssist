/**
 * P1-MNY-01 — Stripe Connect for firm invoice card payments.
 *
 * Account type: STANDARD, expressed with the `controller` properties Stripe now
 * documents in place of the deprecated `type` parameter
 * (docs.stripe.com/api/accounts/create, checked 22/10/2026):
 *   - stripe_dashboard.type "full"  -> the firm gets the full Stripe Dashboard
 *   - fees.payer "account"          -> the firm pays its own Stripe fees
 *   - losses.payments "stripe"      -> Stripe, not RestoreAssist, carries
 *                                      negative-balance losses
 *   - requirement_collection left at Stripe's default ("stripe"): Stripe-hosted
 *     onboarding collects and maintains the firm's details.
 * These equal Stripe's documented defaults; they are set explicitly so the
 * intent is visible and a default change at Stripe cannot silently move
 * liability onto the platform.
 *
 * Charges are DIRECT charges on the firm's account ({ stripeAccount }), with no
 * application fee: RestoreAssist takes nothing from the payment.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const STANDARD_ACCOUNT_CONTROLLER = {
  stripe_dashboard: { type: "full" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
} as const satisfies Stripe.AccountCreateParams.Controller;

/** Stripe idempotency key for a workspace's one connected account. */
export function connectAccountIdempotencyKey(workspaceId: string): string {
  return `connect-acct-${workspaceId}`;
}

/**
 * Mirror Stripe's view of a connected account onto the workspace that holds
 * it. Keyed by the account id, so an event for an account RestoreAssist does
 * not hold changes nothing. Returns the number of workspaces updated (0 or 1).
 */
export async function syncConnectAccountStatus(
  account: Pick<Stripe.Account, "id" | "charges_enabled" | "details_submitted">,
): Promise<number> {
  const result = await prisma.workspace.updateMany({
    where: { stripeConnectAccountId: account.id },
    data: {
      stripeConnectChargesEnabled: account.charges_enabled === true,
      stripeConnectDetailsSubmitted: account.details_submitted === true,
      stripeConnectStatusAt: new Date(),
    },
  });
  return result.count;
}
