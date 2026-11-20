/**
 * Stripe payment_intent.succeeded -> RestoreAssist invoice reconciliation.
 *
 * Moved unchanged out of app/api/webhooks/stripe/route.ts (RA-1139 and the
 * serializable-transaction hardening) so the platform webhook and the P1-MNY-01
 * Connect webhook share ONE copy of the money path.
 *
 * P1-MNY-01 adds one rule, applied only when `connectedAccountId` is given (the
 * Connect webhook passes `event.account`): the invoice is paid only if the
 * money landed in the connected account of the invoice's OWN workspace. Any
 * other account — or an invoice with no workspace or no connected account —
 * leaves the invoice unpaid and writes a `stripe_connect_account_mismatch`
 * audit row on it, committed in the same transaction.
 *
 * The caller maps the result to HTTP. Exceptions (metadata, currency or amount
 * mismatches, conflicting evidence) are thrown, exactly as before, so the
 * webhook records the event FAILED and Stripe retries.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { onInvoicePaid } from "@/lib/lifecycle/subscribers/invoice-paid";

export type InvoicePaymentIntentResult =
  /** Not an invoice payment (one-time add-on / lifetime) — fulfilled elsewhere. */
  | { kind: "not-invoice" }
  /** Looks like an invoice payment but carries no invoiceId. */
  | { kind: "missing-invoice-id" }
  | { kind: "orphan"; invoiceId: string }
  | { kind: "account-mismatch"; invoiceId: string }
  | { kind: "recorded"; invoiceId: string }
  | { kind: "already-recorded"; invoiceId: string };

export interface ReconcileOptions {
  /**
   * The connected account the event came from (`event.account`). Given only by
   * the Connect webhook; when set, it must equal the invoice workspace's
   * `stripeConnectAccountId`.
   */
  connectedAccountId?: string | null;
}

export async function reconcileInvoicePaymentIntent(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
  options: ReconcileOptions = {},
): Promise<InvoicePaymentIntentResult> {
  const invoiceId = paymentIntent.metadata?.invoiceId;
  const isConnect = options.connectedAccountId !== undefined;

  // R6 — one-time addon/lifetime payment intents legitimately carry NO
  // invoiceId (they are fulfilled via checkout.session.completed). Return
  // 2xx for them instead of 400, so Stripe does not enter a retry loop on
  // a payment that is not a RestoreAssist-invoice payment.
  if (!invoiceId) {
    const piType = paymentIntent.metadata?.type;
    const piUserId = paymentIntent.metadata?.userId;
    if (piType === "addon" || piType === "lifetime" || piUserId) {
      // Fulfilled elsewhere (the checkout.session.completed handler).
      return { kind: "not-invoice" };
    }
    // Genuine RestoreAssist-invoice PI that should have carried an
    // invoiceId → 400 so Stripe retries and ops are alerted.
    console.error(
      "[stripe-webhook] payment_intent.succeeded missing invoiceId metadata",
      {
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
      },
    );
    return { kind: "missing-invoice-id" };
  }

  const amountReceived = paymentIntent.amount_received;
  const currency = paymentIntent.currency?.toUpperCase();
  const stripeChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;

  if (
    paymentIntent.status !== "succeeded" ||
    !Number.isInteger(amountReceived) ||
    amountReceived <= 0 ||
    !currency
  ) {
    throw new Error(
      `Invalid succeeded PaymentIntent payload for ${paymentIntent.id}`,
    );
  }

  let paymentResult:
    | { kind: "recorded" }
    | { kind: "already-recorded" }
    | { kind: "orphan" }
    | { kind: "account-mismatch" }
    | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      paymentResult = await prisma.$transaction(
        async (tx) => {
          const invoice = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: {
              id: true,
              invoiceNumber: true,
              userId: true,
              status: true,
              currency: true,
              totalIncGST: true,
              amountPaid: true,
              amountDue: true,
              workspaceId: true,
              workspace: { select: { stripeConnectAccountId: true } },
            },
          });

          if (!invoice) return { kind: "orphan" as const };

          // P1-MNY-01: a Connect payment pays only the invoice of the firm
          // whose own connected account received the money.
          if (isConnect) {
            const expectedAccount =
              invoice.workspace?.stripeConnectAccountId ?? null;
            if (
              !options.connectedAccountId ||
              !invoice.workspaceId ||
              !expectedAccount ||
              expectedAccount !== options.connectedAccountId
            ) {
              await tx.invoiceAuditLog.create({
                data: {
                  invoiceId,
                  userId: invoice.userId,
                  action: "stripe_connect_account_mismatch",
                  description:
                    "A Stripe payment from a connected account that does not belong to this invoice's business was refused. The invoice was not marked paid.",
                  metadata: {
                    paymentIntentId: paymentIntent.id,
                    webhookEventId: event.id,
                    eventAccount: options.connectedAccountId ?? null,
                    expectedAccount,
                    workspaceId: invoice.workspaceId,
                    amount: amountReceived,
                    currency,
                  },
                },
              });
              return { kind: "account-mismatch" as const };
            }
          }

          if (
            paymentIntent.metadata?.type !== "invoice" ||
            paymentIntent.metadata?.userId !== invoice.userId ||
            paymentIntent.metadata?.invoiceNumber !== invoice.invoiceNumber
          ) {
            throw new Error(
              `PaymentIntent ${paymentIntent.id} metadata does not match invoice ${invoiceId}`,
            );
          }

          if (currency !== invoice.currency.toUpperCase()) {
            throw new Error(
              `PaymentIntent ${paymentIntent.id} currency does not match invoice ${invoiceId}`,
            );
          }

          const existingPayment = await tx.invoicePayment.findUnique({
            where: { stripePaymentIntentId: paymentIntent.id },
            select: {
              id: true,
              invoiceId: true,
              amount: true,
              currency: true,
              stripeChargeId: true,
              reconciled: true,
            },
          });

          if (existingPayment) {
            if (
              existingPayment.invoiceId !== invoiceId ||
              existingPayment.amount !== amountReceived ||
              existingPayment.currency.toUpperCase() !== currency ||
              (existingPayment.stripeChargeId &&
                stripeChargeId &&
                existingPayment.stripeChargeId !== stripeChargeId) ||
              !existingPayment.reconciled
            ) {
              throw new Error(
                `PaymentIntent ${paymentIntent.id} conflicts with existing payment evidence`,
              );
            }
            if (
              invoice.status !== "PAID" ||
              invoice.amountPaid !== invoice.totalIncGST ||
              invoice.amountDue !== 0
            ) {
              throw new Error(
                `PaymentIntent ${paymentIntent.id} evidence conflicts with invoice balance`,
              );
            }

            const existingAllocation =
              await tx.invoicePaymentAllocation.findUnique({
                where: {
                  paymentId_invoiceId: {
                    paymentId: existingPayment.id,
                    invoiceId,
                  },
                },
                select: { allocatedAmount: true },
              });
            if (
              existingAllocation &&
              existingAllocation.allocatedAmount !== amountReceived
            ) {
              throw new Error(
                `PaymentIntent ${paymentIntent.id} conflicts with its invoice allocation`,
              );
            }
            if (!existingAllocation) {
              await tx.invoicePaymentAllocation.create({
                data: {
                  paymentId: existingPayment.id,
                  invoiceId,
                  allocatedAmount: amountReceived,
                },
              });
            }
            return { kind: "already-recorded" as const };
          }

          if (
            invoice.status === "DRAFT" ||
            invoice.status === "CANCELLED" ||
            invoice.status === "WRITTEN_OFF" ||
            invoice.status === "REFUNDED" ||
            amountReceived !== invoice.amountDue ||
            invoice.amountPaid + amountReceived !== invoice.totalIncGST
          ) {
            throw new Error(
              `PaymentIntent ${paymentIntent.id} amount or invoice state does not match invoice ${invoiceId}`,
            );
          }

          const paidAt = new Date();
          const invoiceUpdated = await tx.invoice.updateMany({
            where: {
              id: invoiceId,
              amountPaid: invoice.amountPaid,
              amountDue: invoice.amountDue,
            },
            data: {
              amountPaid: invoice.totalIncGST,
              amountDue: 0,
              status: "PAID",
              paidDate: paidAt,
            },
          });
          if (invoiceUpdated.count === 0) {
            throw Object.assign(
              new Error("Invoice changed during Stripe reconciliation"),
              { code: "P2034" },
            );
          }

          const payment = await tx.invoicePayment.create({
            data: {
              amount: amountReceived,
              currency: invoice.currency,
              paymentMethod: "STRIPE",
              paymentDate: paymentIntent.created
                ? new Date(paymentIntent.created * 1000)
                : paidAt,
              reference: paymentIntent.id,
              notes: isConnect
                ? "Automatically reconciled from Stripe Connect webhook"
                : "Automatically reconciled from Stripe webhook",
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: stripeChargeId ?? null,
              webhookEventId: event.id,
              invoiceId,
              userId: invoice.userId,
              reconciled: true,
              reconciledAt: paidAt,
            },
            select: { id: true },
          });

          await tx.invoicePaymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId,
              allocatedAmount: amountReceived,
            },
          });

          await tx.invoiceAuditLog.create({
            data: {
              invoiceId,
              userId: invoice.userId,
              action: "payment_received",
              description: `Stripe payment ${(amountReceived / 100).toFixed(2)} ${currency} reconciled`,
              metadata: {
                paymentId: payment.id,
                paymentIntentId: paymentIntent.id,
                stripeChargeId: stripeChargeId ?? null,
                webhookEventId: event.id,
                amount: amountReceived,
                currency,
                ...(isConnect
                  ? { connectedAccountId: options.connectedAccountId }
                  : {}),
              },
            },
          });

          return { kind: "recorded" as const };
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }

  if (paymentResult?.kind === "orphan") {
    console.error("[stripe-webhook] orphaned invoiceId — Invoice row not found", {
      eventId: event.id,
      invoiceId,
      paymentIntentId: paymentIntent.id,
    });
    await prisma.stripeWebhookEvent.updateMany({
      where: { stripeEventId: event.id },
      data: {
        status: "SKIPPED",
        processedAt: new Date(),
        errorMessage: `Invoice ${invoiceId} was not found`,
      },
    });
    return { kind: "orphan", invoiceId };
  }

  if (paymentResult?.kind === "account-mismatch") {
    console.error(
      "[stripe-connect-webhook] payment from a connected account that does not own the invoice — refused",
      {
        eventId: event.id,
        invoiceId,
        paymentIntentId: paymentIntent.id,
        eventAccount: options.connectedAccountId ?? null,
      },
    );
    return { kind: "account-mismatch", invoiceId };
  }

  if (!paymentResult) {
    throw new Error(
      `Stripe reconciliation did not complete for ${paymentIntent.id}`,
    );
  }

  // Punch-list P1 #21 — fire-and-forget invoice-paid subscriber.
  // Notifies the tradie + writes AuditLog. Deliberately does NOT
  // advance Inspection.status (SP-A §5.3 editability invariant —
  // only the human presses "Close Job"). Per CLAUDE.md rule #13,
  // the subscriber is fire-and-forget so its failure cannot block
  // the webhook's 200 to Stripe. The subscriber catches internally
  // and returns a result; .catch here is a defense-in-depth net.
  if (paymentResult.kind === "recorded") {
    void onInvoicePaid(invoiceId).catch((err) => {
      console.error(
        "[stripe-webhook] onInvoicePaid subscriber threw (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    });
  }

  return { kind: paymentResult.kind, invoiceId };
}
