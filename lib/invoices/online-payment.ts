/**
 * P1-MNY-00 / P1-MNY-01 — invoice Pay Online (card payment) switch.
 *
 * P1-MNY-00 contained the old checkout, which charged into RestoreAssist's own
 * Stripe account. P1-MNY-01 rebuilt it as a direct charge on the firm's own
 * connected Stripe account (Stripe Connect, Standard). It stays OFF until the
 * founder turns it on: only the exact string "true" in
 * INVOICE_ONLINE_PAYMENT_ENABLED enables it, so a missing or mistyped value
 * can never switch card payments on. Recording a payment by hand is
 * unaffected either way.
 *
 * Server-side only in practice: the variable is not NEXT_PUBLIC_, so a client
 * component must ask the server (GET /api/invoices/[id] -> onlinePayment).
 */
export function isInvoiceOnlinePaymentEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.INVOICE_ONLINE_PAYMENT_ENABLED === "true";
}

export const INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment for invoices is not available yet. Record the payment against the invoice instead.";
