/**
 * P1-MNY-01 — can this invoice be paid by card right now?
 *
 * One server-side answer, used by both the checkout route (which refuses when
 * unavailable) and GET /api/invoices/[id] (whose `onlinePayment.available`
 * decides whether the page shows Pay Online). Preconditions, in order:
 *
 *   1. the INVOICE_ONLINE_PAYMENT_ENABLED flag is on;
 *   2. the invoice belongs to a workspace (the firm);
 *   3. that workspace has an ACTIVE PAYMENTS add-on;
 *   4. that workspace has connected its own Stripe account;
 *   5. Stripe reports charges enabled on that account (kept current by the
 *      Connect webhook's account.updated and the onboarding return route).
 *
 * The workspace is always the INVOICE's workspace, never one taken from the
 * request. Any lookup error reads as unavailable (fail closed).
 */
import { prisma } from "@/lib/prisma";
import { requireAddonForWorkspace } from "@/lib/entitlements/require-addon";
import { PAYMENTS_SKU } from "@/lib/billing/payments-addon";
import { isInvoiceOnlinePaymentEnabled } from "./online-payment";

export type OnlinePaymentUnavailableReason =
  | "FLAG_OFF"
  | "NO_WORKSPACE"
  | "NO_ADDON"
  | "NOT_CONNECTED"
  | "CHARGES_DISABLED"
  | "ERROR";

export type InvoiceOnlinePayment =
  | { available: true; workspaceId: string; stripeAccountId: string }
  | { available: false; reason: OnlinePaymentUnavailableReason };

export const ONLINE_PAYMENT_REASON_MESSAGES: Record<
  OnlinePaymentUnavailableReason,
  string
> = {
  FLAG_OFF:
    "Online payment for invoices is not available yet. Record the payment against the invoice instead.",
  NO_WORKSPACE:
    "This invoice is not linked to a business workspace, so it cannot be paid online. Record the payment against the invoice instead.",
  NO_ADDON:
    "Online payment needs the Payments Collection add-on. Record the payment against the invoice instead.",
  NOT_CONNECTED:
    "Connect your business's Stripe account before taking card payments on invoices.",
  CHARGES_DISABLED:
    "Your Stripe account cannot take card payments yet. Finish Stripe's setup, then try again.",
  ERROR:
    "Online payment could not be checked right now. Record the payment against the invoice instead.",
};

export async function getInvoiceOnlinePayment(invoice: {
  workspaceId: string | null;
}): Promise<InvoiceOnlinePayment> {
  if (!isInvoiceOnlinePaymentEnabled()) {
    return { available: false, reason: "FLAG_OFF" };
  }
  const workspaceId = invoice.workspaceId;
  if (!workspaceId) return { available: false, reason: "NO_WORKSPACE" };

  try {
    const addon = await requireAddonForWorkspace(workspaceId, PAYMENTS_SKU);
    if (!addon.allowed) return { available: false, reason: "NO_ADDON" };

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    });
    if (!workspace?.stripeConnectAccountId) {
      return { available: false, reason: "NOT_CONNECTED" };
    }
    if (!workspace.stripeConnectChargesEnabled) {
      return { available: false, reason: "CHARGES_DISABLED" };
    }
    return {
      available: true,
      workspaceId,
      stripeAccountId: workspace.stripeConnectAccountId,
    };
  } catch (err) {
    console.error(
      "[online-payment] availability check failed (fail closed):",
      err instanceof Error ? err.message : err,
    );
    return { available: false, reason: "ERROR" };
  }
}
