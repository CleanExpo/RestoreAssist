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
    // RA-6992 — the owning integration was deleted mid-flight: not a
    // transient failure, so retrying can never resolve it. Mark SKIPPED with
    // an explicit reason instead of COMPLETED (silent) or FAILED (retried).
    if (error instanceof IntegrationDeletedError) {
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: "SKIPPED",
          processedAt: new Date(),
          errorMessage: error.message,
        },
      });
      console.warn(
        `[Webhook Processor] Event ${eventId} skipped: ${error.message}`,
      );
      return;
    }

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

  // A QBO Payment carries one Line per invoice it settles, each with its own
  // Amount and Invoice LinkedTxn. Credit each invoice its OWN line Amount — not
  // the whole TotalAmt to the first invoice — so a payment split across N
  // invoices allocates correctly (RA-6984).
  const allocations = (payment.Line ?? []).flatMap((line) => {
    const invoiceTxn = (line.LinkedTxn ?? []).find(
      (txn) => txn.TxnType === "Invoice",
    );
    if (!invoiceTxn || typeof line.Amount !== "number" || line.Amount <= 0) {
      return [];
    }
    return [{ externalInvoiceId: invoiceTxn.TxnId, amount: line.Amount }];
  });

  if (allocations.length === 0) {
    console.warn(
      `[Webhook Processor] QUICKBOOKS payment ${paymentId} resolved via API but has no invoice ` +
        `LinkedTxn with a positive line amount — skipping without recording`,
    );
    return;
  }

  await recordExternalPayment(event, {
    externalPaymentId: paymentId,
    paymentDate: new Date(payment.TxnDate || Date.now()),
    paymentReference: payment.PaymentRefNum ?? null,
    allocations,
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

  // Each applied invoice carries its OWN AmountApplied — credit that, not the
  // whole AmountReceived to Invoices[0] — so a payment split across N invoices
  // allocates correctly (RA-6984).
  const allocations = (payment.Invoices ?? []).flatMap((inv) => {
    if (
      !inv.UID ||
      typeof inv.AmountApplied !== "number" ||
      inv.AmountApplied <= 0
    ) {
      return [];
    }
    return [{ externalInvoiceId: inv.UID, amount: inv.AmountApplied }];
  });

  if (allocations.length === 0) {
    console.warn(
      `[Webhook Processor] MYOB payment ${resourceUid} resolved via API but has no applied ` +
        `invoice with a positive amount — skipping without recording`,
    );
    return;
  }

  await recordExternalPayment(event, {
    externalPaymentId: resourceUid,
    paymentDate: new Date(payment.Date || Date.now()),
    paymentReference: null,
    allocations,
  });
}

/**
 * RA-6992 — thrown by recordExternalPayment when the owning integration was
 * deleted between the webhook arriving and processing. A silent early-return
 * here let the caller mark the event COMPLETED with no payment recorded and
 * no distinct signal, so a genuinely orphaned payment became invisible. Every
 * caller of handlePaymentCreated catches this specifically and marks the
 * event SKIPPED with this message as the reason, instead of retrying or
 * completing — the integration is gone, so a retry cannot resolve it.
 */
export class IntegrationDeletedError extends Error {
  constructor(integrationId: string) {
    super(
      `Integration ${integrationId} deleted — payment not recorded`,
    );
    this.name = "IntegrationDeletedError";
  }
}

interface PaymentAllocation {
  externalInvoiceId: string;
  amount: number; // dollars applied to THIS invoice, provider-native
}

interface ResolvedPayment {
  externalPaymentId: string;
  paymentDate: Date;
  paymentReference: string | null;
  allocations: PaymentAllocation[];
}

/**
 * Records a resolved external payment against the invoice(s) it was applied
 * to — split out of handlePaymentCreated (RA-6984) so both the QuickBooks and
 * MYOB API resolvers share the same recording path.
 *
 * CRITICAL tenant scoping (RA-6984): QBO TxnIds and MYOB UIDs are per-tenant
 * identifiers, and the Invoice (externalSyncProvider, externalInvoiceId)
 * unique key is GLOBAL — so an unscoped lookup could match a DIFFERENT
 * tenant's invoice and post a payment onto their ledger. Every invoice lookup
 * is scoped to the integration's owning userId so a payment can only ever
 * settle an invoice owned by the same tenant.
 */
async function recordExternalPayment(
  event: any,
  resolved: ResolvedPayment,
): Promise<void> {
  const { externalPaymentId, paymentDate, paymentReference, allocations } =
    resolved;

  const integration = await prisma.integration.findUnique({
    where: { id: event.integrationId },
    select: { userId: true },
  });
  if (!integration) {
    throw new IntegrationDeletedError(event.integrationId);
  }

  for (const allocation of allocations) {
    await recordInvoiceAllocation(event, integration.userId, {
      externalInvoiceId: allocation.externalInvoiceId,
      externalPaymentId,
      paymentAmount: allocation.amount,
      paymentDate,
      paymentReference,
    });
  }
}

interface ResolvedInvoiceAllocation {
  externalInvoiceId: string;
  externalPaymentId: string;
  paymentAmount: number; // dollars, provider-native
  paymentDate: Date;
  paymentReference: string | null;
}

/**
 * Atomic create + increment of a single invoice allocation. Prevents TOCTOU
 * duplicate payment and ensures amountPaid/amountDue update with correct
 * concurrent values. The invoice lookup is scoped to `ownerUserId` (resolved
 * in recordExternalPayment) so a cross-tenant invoice can never match.
 */
async function recordInvoiceAllocation(
  event: any,
  ownerUserId: string,
  resolved: ResolvedInvoiceAllocation,
): Promise<void> {
  const {
    externalInvoiceId,
    externalPaymentId,
    paymentAmount,
    paymentDate,
    paymentReference,
  } = resolved;

  // Find the invoice by external ID, scoped to the owning tenant
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalSyncProvider: event.provider,
      userId: ownerUserId,
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

  // Atomic create + increment inside a transaction — ensures amountPaid/amountDue
  // move together with the payment row. `externalPaymentId` has NO DB unique
  // constraint (only an index), so P2002 does not dedup here; the per-allocation
  // existence check below is the real idempotency guard. It closes the
  // multi-invoice partial-failure window: if a payment splits across invoices
  // and a later allocation throws after an earlier one committed, the event is
  // retried and re-runs every allocation — without this check invoice 1 would be
  // credited twice. The check is in-transaction so it is atomic with the credit.
  let payment: { id: string } | null;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const alreadyRecorded = await tx.invoicePayment.findFirst({
        where: {
          externalPaymentId,
          invoiceId: invoice.id,
          externalProvider: event.provider,
        },
        select: { id: true },
      });
      if (alreadyRecorded) return null;

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

      return created;
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      console.log(
        `[Webhook Processor] Payment already exists: ${externalPaymentId}`,
      );
      return;
    }
    throw err;
  }

  if (!payment) {
    console.log(
      `[Webhook Processor] Allocation already recorded for payment ${externalPaymentId} on invoice ${invoice.id} — skipped (idempotent retry)`,
    );
    return;
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

// RA-6974 / #1699 — the exact errorMessage each provider's webhook route
// writes when marking a payment.created stub SKIPPED at ingest, because at the
// time neither provider's webhook payload alone could resolve a settled
// payment. RA-6984 resolves both via the provider API instead, so events
// carrying these markers are retried, not permanently stuck.
// retryUnresolvedQboMyobPayments re-selects events by these markers, so on a
// transient resolution failure it MUST restore the event's ORIGINAL provider
// marker (never the transient error) — otherwise the event drops out of this
// filter forever, the RA-6974 orphaning pathology. Kept in sync with
// app/api/webhooks/quickbooks/route.ts and app/api/webhooks/myob/route.ts.
const RA_1699_STUB_MARKER_BY_PROVIDER: Record<string, string> = {
  QUICKBOOKS:
    "QuickBooks payment CDC notification has no LinkedTxn/TotalAmt - cannot resolve a settled payment from the webhook payload alone",
  MYOB: "MYOB payment notification is a CDC stub with no Amount/InvoiceUID - cannot resolve a settled payment from the webhook payload alone",
};

const RA_1699_UNRESOLVABLE_STUB_MARKERS = Object.values(
  RA_1699_STUB_MARKER_BY_PROVIDER,
);

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
      // RA-6992 — integration deleted mid-flight is terminal, not transient;
      // mark SKIPPED with the reason instead of retrying it as a failure.
      if (err instanceof IntegrationDeletedError) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "SKIPPED",
            processedAt: new Date(),
            errorMessage: err.message,
          },
        });
        result.skipped++;
        continue;
      }

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
 * On a transient failure (e.g. a 429/timeout, or the payment not yet visible
 * upstream) the event is restored to SKIPPED with its ORIGINAL provider stub
 * marker so it stays eligible for the next cron run, and retryCount is
 * incremented. Once retryCount reaches the bound the event transitions to
 * FAILED so a genuinely unresolvable payment surfaces to monitoring instead
 * of retrying forever. (Persisting the transient error as errorMessage
 * instead would drop the event out of the RA-1699 marker filter permanently —
 * the RA-6974 orphaning bug.)
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
      // RA-6992 — integration deleted mid-flight is terminal, not transient;
      // mark SKIPPED with the reason (which does NOT match the RA-1699 stub
      // marker filter above) instead of restoring the stub marker for another
      // retry pass that can never succeed.
      if (err instanceof IntegrationDeletedError) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "SKIPPED",
            processedAt: new Date(),
            errorMessage: err.message,
          },
        });
        result.skipped++;
        continue;
      }

      const message = err instanceof Error ? err.message : String(err);
      const retryCount = event.retryCount + 1;
      const maxRetries = 5;
      if (retryCount >= maxRetries) {
        // Exhausted — surface to FAILED monitoring instead of silently
        // retrying forever. Terminal, so it leaves the SKIPPED marker filter.
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "FAILED", errorMessage: message, retryCount },
        });
        result.failed++;
      } else {
        // Transient — restore the ORIGINAL provider stub marker (NOT the
        // transient error) so the errorMessage `in` filter re-selects it next
        // run, and bound the attempts via retryCount. Overwriting the marker
        // here would orphan the payment forever (RA-6974).
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "SKIPPED",
            errorMessage:
              RA_1699_STUB_MARKER_BY_PROVIDER[event.provider] ?? message,
            retryCount,
          },
        });
        result.skipped++;
      }
    }
  }

  return result;
}
