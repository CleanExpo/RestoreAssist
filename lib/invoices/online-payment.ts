/**
 * P1-MNY-00 — invoice Pay Online is contained.
 *
 * The invoice checkout created Stripe sessions on RestoreAssist's own account,
 * so a customer paying a firm's invoice paid the platform, not the firm. It
 * stays off until payments route to the firm's own connected account
 * (P1-MNY-01). Recording a payment by hand is unaffected.
 */
export const INVOICE_ONLINE_PAYMENT_ENABLED: boolean = false;

export const INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment for invoices is not available yet. Record the payment against the invoice instead.";
