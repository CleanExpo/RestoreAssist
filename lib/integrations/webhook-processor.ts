import { prisma } from "@/lib/prisma";
import { IntegrationProvider, WebhookEventStatus } from "@prisma/client";
import { processXeroWebhookBatch } from "@/lib/integrations/xero/webhook-processor";
import { createQuickBooksClient } from "@/lib/integrations/quickbooks/client";
import { createMYOBClient } from "@/lib/integrations/myob/client";

/**
 * Webhook Event Processor
 *
 * Processes queued webhook events from accounting systems
 * Handles payment status updates, invoice changes, and customer sync
 */

interface WebhookEvent {
  id: string;
  provider: IntegrationProvider;
  integrationId: string;
  eventType: string;
  payload: any;
  signature: string | null;
  status: WebhookEventStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Main entry point for processing a webhook event
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
    include: {
      integration: true,
    },
  });

  if (!event) {
    console.error(`[Webhook Processor] Event ${eventId} not found`);
    return;
  }

  // RA-6965 — XERO events must be resolved through the Xero batch processor,
  // which fetches the real settled amount from the Xero Payments API. The
  // generic handler below read amounts off the webhook ID-stub and recorded
  // $0 "reconciled" payments. Delegate the whole XERO event to
  // processXeroWebhookBatch — it self-claims PENDING rows atomically, so this
  // is race-safe with the sync-xero-payments cron — and return before the
  // generic claim/route runs.
  if (event.provider === "XERO") {
    await processXeroWebhookBatch();
    return;
  }

  // Atomic CAS — claim ownership before processing; prevents duplicate execution across concurrent workers
  const claimed = await prisma.webhookEvent.updateMany({
    where: {
      id: eventId,
      status: { notIn: ["PROCESSING", "COMPLETED", "SKIPPED"] },
    },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    console.log(
      `[Webhook Processor] Event ${eventId} already claimed, completed, or skipped — skipping`,
    );
    return;
  }

  try {
    console.log(
      `[Webhook Processor] Processing event ${eventId}: ${event.eventType}`,
    );

    // Route to appropriate handler based on event type
    switch (event.eventType) {
      case "invoice.paid":
      case "payment.created":
        await handlePaymentCreated(event);
        break;

      case "invoice.updated":
        await handleInvoiceUpdated(event);
        break;

      case "invoice.created":
        await handleInvoiceCreated(event);
        break;

      case "invoice.deleted":
        await handleInvoiceDeleted(event);
        break;

      case "customer.created":
      case "customer.updated":
        await handleCustomerUpdated(event);
        break;

      case "job.created":
      case "job.updated":
      case "job.completed":
      case "job.cancelled":
      case "job.status_updated":
        await handleJobEvent(event);
        break;

      case "contact.created":
      case "contact.updated":
        await handleContactUpdated(event);
        break;

      default:
        console.log(
          `[Webhook Processor] Unhandled event type: ${event.eventType}`,
        );
        // Mark as SKIPPED for unsupported event types
        await prisma.webhookEvent.update({
          where: { id: eventId },
          data: {
            status: "SKIPPED",
            processedAt: new Date(),
            errorMessage: `Unsupported event type: ${event.eventType}`,
          },
        });
        return;
    }

    // Mark as completed
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    console.log(`[Webhook Processor] Successfully processed event ${eventId}`);
  } catch (error: any) {
    console.error(
      `[Webhook Processor] Error processing event ${eventId}:`,
      error,
    );

    // Update retry count and status
    const retryCount = event.retryCount + 1;
    const maxRetries = 5;

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: retryCount >= maxRetries ? "FAILED" : "PENDING",
        errorMessage: error.message || "Unknown error",
        retryCount,
      },
    });

    if (retryCount >= maxRetries) {
      console.error(
        `[Webhook Processor] Event ${eventId} failed after ${maxRetries} retries`,
      );
    }
  }
}

/**
 * Handle payment created / invoice paid events
 *
 * RA-6965 — XERO is delegated to processXeroWebhookBatch upstream (it
 * resolves the real payment via the Xero Payments API), so it never reaches
 * here.
 *
 * RA-6984 — QUICKBOOKS/MYOB webhooks deliver ID-stubs (RA-6974 / #1699): the
 * CDC/raw-notification payload never carries the settled amount or the
 * invoice it was applied to. Rather than trusting the stub (and skipping
 * when it inevitably lacks what's needed), resolve the real payment via the
 * provider API using the identifier the stub DOES carry — mirroring how
 * processXeroWebhookBatch calls the Xero Payments API.
 */
async function handlePaymentCreated(event: any): Promise<void> {
  if (event.provider === "QUICKBOOKS") {
    await handleQuickBooksPaymentCreated(event);
    return;
  }
  if (event.provider === "MYOB") {
    await handleMyobPaymentCreated(event);
    return;
  }
  console.warn(
    `[Webhook Processor] Unsupported provider ${event.provider} for payment recording — skipping`,
  );
}

/**
 * Resolves a QuickBooks Payment CDC stub via the QBO Payments API.
 *
 * The Payment "Create"/"Update" CDC notification only ever carries
 * { name, id, operation, lastUpdated } — never LinkedTxn/TotalAmt. Fetch the
 * full Payment entity by that id to get the real settled amount and the
 * invoice it was applied to.
 */
async function handleQuickBooksPaymentCreated(event: any): Promise<void> {
  const payload = event.payload;
  const paymentId: string | null = payload?.id ?? payload?.Id ?? null;

  if (!paymentId) {
    console.warn(
      `[Webhook Processor] QUICKBOOKS payment event missing entity id — skipping without recording`,
    );
    return;
  }

  const client = await createQuickBooksClient(event.integrationId);
  const payment = await client.getPayment(paymentId);

  const linkedInvoiceTxn = (payment.Line ?? [])
    .flatMap((line) => line.LinkedTxn ?? [])
    .find((txn) => txn.TxnType === "Invoice");
  const externalInvoiceId = linkedInvoiceTxn?.TxnId ?? null;
  const paymentAmount =
    typeof payment.TotalAmt === "number" ? payment.TotalAmt : 0;

  if (!externalInvoiceId || paymentAmount <= 0) {
    console.warn(
      `[Webhook Processor] QUICKBOOKS payment ${paymentId} resolved via API but has no invoice ` +
        `LinkedTxn or positive TotalAmt — skipping without recording`,
    );
    return;
  }

  await recordExternalPayment(event, {
    externalInvoiceId,
    externalPaymentId: paymentId,
    paymentAmount,
    paymentDate: new Date(payment.TxnDate || Date.now()),
    paymentReference: payment.PaymentRefNum ?? null,
  });
}

/**
 * Resolves a MYOB Sale.CustomerPayment "Created" notification via the MYOB
 * CustomerPayment API.
 *
 * The raw notification only ever carries
 * { CompanyFileId, EventType, ResourceType, ResourceUID } — never
 * Amount/InvoiceUID. Fetch the full CustomerPayment resource by the
 * notification's ResourceUID to get the real settled amount and the
 * invoice(s) it was applied to.
 */
async function handleMyobPaymentCreated(event: any): Promise<void> {
  const payload = event.payload;
  const resourceUid: string | null = payload?.ResourceUID ?? null;

  if (!resourceUid) {
    console.warn(
      `[Webhook Processor] MYOB payment event missing ResourceUID — skipping without recording`,
    );
    return;
  }

  const client = await createMYOBClient(event.integrationId);
  const payment = await client.getCustomerPayment(resourceUid);

  const firstInvoice = (payment.Invoices ?? [])[0];
  const externalInvoiceId = firstInvoice?.UID ?? null;
  const paymentAmount =
    typeof payment.AmountReceived === "number" ? payment.AmountReceived : 0;

  if (!externalInvoiceId || paymentAmount <= 0) {
    console.warn(
      `[Webhook Processor] MYOB payment ${resourceUid} resolved via API but has no applied ` +
        `invoice or positive AmountReceived — skipping without recording`,
    );
    return;
  }

  await recordExternalPayment(event, {
    externalInvoiceId,
    externalPaymentId: resourceUid,
    paymentAmount,
    paymentDate: new Date(payment.Date || Date.now()),
    paymentReference: null,
  });
}

interface ResolvedPayment {
  externalInvoiceId: string;
  externalPaymentId: string;
  paymentAmount: number; // dollars, provider-native
  paymentDate: Date;
  paymentReference: string | null;
}

/**
 * Atomic create + increment of a resolved external payment — split out of
 * handlePaymentCreated (RA-6984) so both the QuickBooks and MYOB API
 * resolvers above share the same recording logic. Prevents TOCTOU duplicate
 * payment and ensures amountPaid/amountDue are updated with correct
 * concurrent values. P2002 on externalPaymentId unique constraint is the
 * last-resort dedup guard.
 */
async function recordExternalPayment(
  event: any,
  resolved: ResolvedPayment,
): Promise<void> {
  const {
    externalInvoiceId,
    externalPaymentId,
    paymentAmount,
    paymentDate,
    paymentReference,
  } = resolved;

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalSyncProvider: event.provider,
    },
  });

  if (!invoice) {
    console.warn(
      `[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`,
    );
    return;
  }

  // Convert payment amount to cents
  const paymentAmountCents = Math.round(paymentAmount * 100);

  // Atomic create + increment inside a transaction — prevents TOCTOU duplicate payment
  // and ensures amountPaid/amountDue are updated with correct concurrent values.
  // P2002 on externalPaymentId unique constraint is the last-resort dedup guard.
  let payment: { id: string };
  try {
    [payment] = await prisma.$transaction(async (tx) => {
      const created = await tx.invoicePayment.create({
        data: {
          amount: paymentAmountCents,
          currency: invoice.currency,
          paymentMethod: "EXTERNAL",
          paymentDate,
          reference: paymentReference || `Payment from ${event.provider}`,
          notes: `Automatically recorded from ${event.provider} webhook`,
          externalPaymentId,
          externalProvider: event.provider,
          webhookEventId: event.id,
          invoiceId: invoice.id,
          userId: invoice.userId,
          reconciled: true,
          reconciledAt: new Date(),
        },
        select: { id: true },
      });

      // Use atomic increment — avoids stale read-modify-write across concurrent webhooks
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: { increment: paymentAmountCents },
          amountDue: { decrement: paymentAmountCents },
        },
        select: { amountPaid: true, amountDue: true, totalIncGST: true },
      });

      // Clamp amountDue to 0 and set PAID status if fully settled
      if (updatedInvoice.amountDue <= 0) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountDue: 0,
            status: "PAID",
            paidDate: new Date(),
          },
        });
      } else {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "PARTIAL" as any },
        });
      }

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          userId: invoice.userId,
          action: "payment_received",
          description: `Payment received from ${event.provider}: $${(paymentAmountCents / 100).toFixed(2)}`,
          metadata: {
            provider: event.provider,
            externalInvoiceId,
            externalPaymentId,
            paymentId: created.id,
            paymentAmount: paymentAmountCents,
            webhookEventId: event.id,
          },
        },
      });

      return [created];
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      console.log(
        `[Webhook Processor] Payment already exists (unique constraint): ${externalPaymentId}`,
      );
      return;
    }
    throw err;
  }

  console.log(
    `[Webhook Processor] Created payment ${payment.id} for invoice ${invoice.id} from ${event.provider}`,
  );
}

/**
 * Handle invoice updated events
 */
async function handleInvoiceUpdated(event: any): Promise<void> {
  const payload = event.payload;

  let externalInvoiceId: string | null = null;

  // Extract invoice ID based on provider
  if (event.provider === "XERO") {
    externalInvoiceId = payload.resourceId;
  } else if (event.provider === "QUICKBOOKS") {
    externalInvoiceId = payload.id;
  } else if (event.provider === "MYOB") {
    externalInvoiceId = payload.ResourceUID;
  }

  if (!externalInvoiceId) {
    throw new Error("Missing external invoice ID in update event");
  }

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalSyncProvider: event.provider,
    },
  });

  if (!invoice) {
    console.warn(
      `[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`,
    );
    return;
  }

  // Create audit log entry for the update
  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      action: "external_update",
      description: `Invoice updated in ${event.provider}`,
      metadata: {
        provider: event.provider,
        externalInvoiceId,
        webhookEventId: event.id,
      },
    },
  });

  console.log(
    `[Webhook Processor] Logged external update for invoice ${invoice.id}`,
  );
}

/**
 * Handle invoice created events
 */
async function handleInvoiceCreated(event: any): Promise<void> {
  // For now, just log the creation
  // In a full two-way sync, we might want to import the invoice
  console.log(
    `[Webhook Processor] Invoice created in ${event.provider}:`,
    event.payload,
  );
}

/**
 * Handle invoice deleted events
 */
async function handleInvoiceDeleted(event: any): Promise<void> {
  const payload = event.payload;

  let externalInvoiceId: string | null = null;

  // Extract invoice ID based on provider
  if (event.provider === "XERO") {
    externalInvoiceId = payload.resourceId;
  } else if (event.provider === "QUICKBOOKS") {
    externalInvoiceId = payload.id;
  } else if (event.provider === "MYOB") {
    externalInvoiceId = payload.ResourceUID;
  }

  if (!externalInvoiceId) {
    throw new Error("Missing external invoice ID in delete event");
  }

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalSyncProvider: event.provider,
    },
  });

  if (!invoice) {
    console.warn(
      `[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`,
    );
    return;
  }

  // Create audit log entry for the deletion
  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      action: "external_delete",
      description: `Invoice deleted in ${event.provider}`,
      metadata: {
        provider: event.provider,
        externalInvoiceId,
        webhookEventId: event.id,
      },
    },
  });

  console.log(
    `[Webhook Processor] Logged external deletion for invoice ${invoice.id}`,
  );
}

/**
 * Handle customer created/updated events
 */
async function handleCustomerUpdated(event: any): Promise<void> {
  // For now, just log the customer change
  // In a full two-way sync, we might want to update client records
  console.log(
    `[Webhook Processor] Customer ${event.eventType} in ${event.provider}:`,
    event.payload,
  );
}

/**
 * Handle job lifecycle events (ServiceM8 Job / GeoActivity).
 *
 * ServiceM8 is a field-service system, not an accounting system, so job
 * events carry no invoice/payment mutation to apply — the invoice sync
 * lives in the nir-sync push layer. These events are acknowledged and
 * logged so they leave PENDING and are marked COMPLETED by the caller,
 * matching how handleCustomerUpdated treats non-financial signals.
 */
async function handleJobEvent(event: any): Promise<void> {
  console.log(
    `[Webhook Processor] Job ${event.eventType} in ${event.provider}:`,
    event.payload,
  );
}

/**
 * Handle contact created/updated events (ServiceM8 JobContact).
 *
 * No downstream client-record mutation today — logged and acknowledged so
 * the event completes rather than being silently SKIPPED.
 */
async function handleContactUpdated(event: any): Promise<void> {
  console.log(
    `[Webhook Processor] Contact ${event.eventType} in ${event.provider}:`,
    event.payload,
  );
}

/**
 * Batch process pending webhook events
 * Should be called by background job queue
 */
export async function processPendingWebhookEvents(
  limit: number = 10,
): Promise<void> {
  const pendingEvents = await prisma.webhookEvent.findMany({
    where: {
      status: "PENDING",
      retryCount: {
        lt: 5, // Max 5 retries
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  });

  console.log(
    `[Webhook Processor] Processing ${pendingEvents.length} pending events`,
  );

  for (const event of pendingEvents) {
    await processWebhookEvent(event.id);
  }
}

export interface ProviderPaymentBatchResult {
  processed: number;
  failed: number;
  skipped: number;
}

// RA-6974 / #1699 — the exact errorMessage strings the QUICKBOOKS and MYOB
// webhook routes write when marking a payment.created stub SKIPPED at
// ingest, because at the time neither provider's webhook payload alone could
// resolve a settled payment. RA-6984 resolves both via the provider API
// instead, so events carrying these markers are retried, not permanently
// stuck. Kept in sync with app/api/webhooks/quickbooks/route.ts and
// app/api/webhooks/myob/route.ts (reserved for a parallel ticket — not
// touched here).
const RA_1699_UNRESOLVABLE_STUB_MARKERS = [
  "QuickBooks payment CDC notification has no LinkedTxn/TotalAmt - cannot resolve a settled payment from the webhook payload alone",
  "MYOB payment notification is a CDC stub with no Amount/InvoiceUID - cannot resolve a settled payment from the webhook payload alone",
];

const QBO_MYOB_PAYMENT_EVENT_SELECT = {
  id: true,
  provider: true,
  integrationId: true,
  eventType: true,
  payload: true,
  retryCount: true,
} as const;

/**
 * RA-6984 — drains PENDING QUICKBOOKS/MYOB payment webhook events via the
 * API-resolving handlePaymentCreated. Mirrors processXeroWebhookBatch's
 * atomic claim (updateMany CAS: PENDING → PROCESSING, count 0 means another
 * worker already claimed it). Nothing else currently processes these events
 * — unlike XERO, which processWebhookEvent delegates to
 * processXeroWebhookBatch inline (RA-6965).
 *
 * Called by /api/cron/sync-qbo-myob-payments.
 */
export async function processQboMyobPendingPayments(
  maxEvents = 50,
): Promise<ProviderPaymentBatchResult> {
  const result: ProviderPaymentBatchResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: { in: ["QUICKBOOKS", "MYOB"] },
      eventType: { in: ["invoice.paid", "payment.created"] },
      status: "PENDING",
    },
    select: QBO_MYOB_PAYMENT_EVENT_SELECT,
    take: maxEvents,
    orderBy: { createdAt: "asc" },
  });

  for (const event of events) {
    const claim = await prisma.webhookEvent.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (claim.count === 0) {
      // Another worker claimed this event between our SELECT and now.
      result.skipped++;
      continue;
    }

    try {
      await handlePaymentCreated(event);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", processedAt: new Date(), errorMessage: null },
      });
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryCount = event.retryCount + 1;
      const maxRetries = 5;
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: retryCount >= maxRetries ? "FAILED" : "PENDING",
          errorMessage: message,
          retryCount,
        },
      });
      result.failed++;
    }
  }

  return result;
}

/**
 * RA-6984 — retroactive pickup for events RA-6974/#1699 marked SKIPPED with
 * an unresolvable-stub errorMessage. Now that handlePaymentCreated resolves
 * via the real QBO/MYOB API instead of trusting the webhook stub, those
 * events are no longer permanently unresolvable — re-attempt them here.
 *
 * A resolution that still fails (e.g. the payment was voided upstream, or
 * the integration is disconnected) restores SKIPPED rather than FAILED —
 * matching the RA-6974/#1699 rationale for marking these SKIPPED in the
 * first place: it is not a transient failure worth surfacing to
 * FAILED-status monitoring, and the next cron run naturally retries it.
 *
 * Called by /api/cron/sync-qbo-myob-payments.
 */
export async function retryUnresolvedQboMyobPayments(
  maxEvents = 50,
): Promise<ProviderPaymentBatchResult> {
  const result: ProviderPaymentBatchResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: { in: ["QUICKBOOKS", "MYOB"] },
      status: "SKIPPED",
      errorMessage: { in: RA_1699_UNRESOLVABLE_STUB_MARKERS },
    },
    select: QBO_MYOB_PAYMENT_EVENT_SELECT,
    take: maxEvents,
    orderBy: { createdAt: "asc" },
  });

  for (const event of events) {
    const claim = await prisma.webhookEvent.updateMany({
      where: { id: event.id, status: "SKIPPED" },
      data: { status: "PROCESSING" },
    });
    if (claim.count === 0) {
      result.skipped++;
      continue;
    }

    try {
      await handlePaymentCreated(event);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", processedAt: new Date(), errorMessage: null },
      });
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "SKIPPED", errorMessage: message },
      });
      result.skipped++;
    }
  }

  return result;
}
