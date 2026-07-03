import { prisma } from "@/lib/prisma";
import { IntegrationProvider, WebhookEventStatus } from "@prisma/client";
import { processXeroWebhookBatch } from "@/lib/integrations/xero/webhook-processor";

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
 */
async function handlePaymentCreated(event: any): Promise<void> {
  const payload = event.payload;

  let externalInvoiceId: string | null = null;
  let externalPaymentId: string | null = null;
  let paymentAmount: number = 0;
  let paymentDate: Date = new Date();
  let paymentReference: string | null = null;

  // RA-6965 — XERO is delegated to processXeroWebhookBatch upstream (it
  // resolves the real payment via the Xero Payments API), so it never reaches
  // here. QUICKBOOKS/MYOB webhooks deliver ID-stubs — the amount on the
  // payload is not the real settled amount. Extract what the stub carries;
  // if a real invoice id, payment id and positive amount cannot be resolved,
  // skip rather than fabricate a $0 / mismatched payment.
  if (event.provider === "QUICKBOOKS") {
    externalInvoiceId = payload.LinkedTxn?.[0]?.TxnId ?? null; // Invoice ID from linked transaction
    externalPaymentId = payload.Id ?? null;
    paymentAmount = typeof payload.TotalAmt === "number" ? payload.TotalAmt : 0;
    paymentDate = new Date(payload.TxnDate || Date.now());
    paymentReference = payload.PaymentRefNum ?? null;
  } else if (event.provider === "MYOB") {
    externalInvoiceId = payload.InvoiceUID ?? payload.ResourceUID ?? null;
    externalPaymentId = payload.UID ?? null;
    paymentAmount = typeof payload.Amount === "number" ? payload.Amount : 0;
    paymentDate = new Date(payload.Date || Date.now());
    paymentReference = payload.Memo ?? null;
  } else {
    console.warn(
      `[Webhook Processor] Unsupported provider ${event.provider} for payment recording — skipping`,
    );
    return;
  }

  // Guard against webhook ID-stubs: never record a $0 or unresolved payment.
  // A stub with no resolvable invoice/payment id or a non-positive amount is
  // skipped (not recorded, not thrown) — this replaces the old blanket throw
  // that made every QUICKBOOKS payment event fail.
  if (!externalInvoiceId || !externalPaymentId || paymentAmount <= 0) {
    console.warn(
      `[Webhook Processor] ${event.provider} payment event unresolvable from webhook stub ` +
        `(invoiceId=${externalInvoiceId}, paymentId=${externalPaymentId}, amount=${paymentAmount}) — skipping without recording`,
    );
    return;
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
