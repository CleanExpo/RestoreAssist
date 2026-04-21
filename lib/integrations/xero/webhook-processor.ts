/**
 * RA-871: Xero Webhook Processor
 *
 * Processes PENDING WebhookEvent rows written by /api/webhooks/xero.
 * Handles three event types that require local state changes:
 *   - invoice.updated  → re-queue the invoice for sync (picks up Xero edits)
 *   - invoice.paid     → mark local invoice as PAID
 *   - payment.created  → mark local invoice as PAID via payment reference
 *
 * Called by /api/cron/sync-xero-payments (and directly from tests).
 * All events are marked COMPLETED or FAILED — never left in PROCESSING indefinitely.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import { getValidXeroToken } from "./token-manager";

/**
 * RA-871: Verify a Xero webhook HMAC-SHA256 signature (timing-safe).
 *
 * @param rawBody  The raw request body as UTF-8 string (do NOT parse JSON first).
 * @param signatureHeader The value of the `x-xero-signature` header (base64).
 * @param webhookKey The shared secret from the Xero Developer portal.
 * @returns true iff the signature matches; false for any error path.
 */
export function verifyXeroWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookKey: string | null | undefined,
): boolean {
  if (!signatureHeader || !webhookKey) return false;
  try {
    const expected = createHmac("sha256", webhookKey)
      .update(rawBody)
      .digest("base64");
    const sigBuf = Buffer.from(signatureHeader, "base64");
    const expBuf = Buffer.from(expected, "base64");
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    // Malformed base64 or other buffer error — treat as invalid
    return false;
  }
}

interface XeroWebhookPayload {
  eventType?: string;
  resourceType?: string;
  resourceId?: string; // Xero InvoiceID or PaymentID
  tenantId?: string;
  eventDateUtc?: string;
}

interface ProcessBatchResult {
  processed: number;
  failed: number;
  skipped: number;
}

/**
 * Process a batch of PENDING Xero webhook events.
 * @param maxEvents Maximum events to process per invocation (default 50).
 */
export async function processXeroWebhookBatch(
  maxEvents = 50,
): Promise<ProcessBatchResult> {
  const result: ProcessBatchResult = { processed: 0, failed: 0, skipped: 0 };

  // Claim a batch — transition PENDING → PROCESSING atomically per event
  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: "XERO",
      status: "PENDING",
    },
    take: maxEvents,
    orderBy: { createdAt: "asc" },
    include: { integration: true },
  });

  for (const event of events) {
    // RA-1332 — atomic claim: SELECT + UPDATE was TOCTOU-racy because two
    // concurrent batch runs could both pick the same PENDING row before
    // either updated it. Use updateMany with a status=PENDING guard so the
    // transition is a single atomic CAS. If count === 0, another instance
    // already claimed this row — skip cleanly.
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
      const payload = event.payload as XeroWebhookPayload;
      const eventType = event.eventType; // normalised in webhook route

      if (eventType === "invoice.updated" || eventType === "invoice.created") {
        await handleInvoiceUpdated(payload, event.integrationId);
      } else if (
        eventType === "invoice.paid" ||
        eventType === "payment.created"
      ) {
        await handleInvoicePaid(payload, event.integrationId);
      } else {
        // Unrecognised event type — skip cleanly, no retry needed
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "SKIPPED", processedAt: new Date() },
        });
        result.skipped++;
        continue;
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", processedAt: new Date() },
      });
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorMessage: message },
      });
      result.failed++;
    }
  }

  return result;
}

/**
 * Handle invoice.updated / invoice.created events.
 * Re-queues the invoice for sync so Xero's version is reconciled locally.
 */
async function handleInvoiceUpdated(
  payload: XeroWebhookPayload,
  integrationId: string,
): Promise<void> {
  const xeroInvoiceId = payload.resourceId;
  if (!xeroInvoiceId) {
    throw new Error(
      "invoice.updated event missing resourceId (Xero InvoiceID)",
    );
  }

  // Find the local invoice by its externalInvoiceId (set when originally synced to Xero)
  const invoice = await prisma.invoice.findFirst({
    where: { externalInvoiceId: xeroInvoiceId },
    select: { id: true, userId: true },
  });

  if (!invoice) {
    // Invoice not in our system — Xero may have created it directly; skip
    console.warn(
      `[Xero Webhook] invoice.updated for unknown Xero ID ${xeroInvoiceId} — skipping`,
    );
    return;
  }

  // Re-queue for sync — deduplication in queueInvoiceSync will no-op if already queued
  await queueInvoiceSync(invoice.id, "XERO", "NORMAL");
  console.log(
    `[Xero Webhook] invoice.updated → queued sync for invoice ${invoice.id}`,
  );
}

/**
 * Handle invoice.paid / payment.created events.
 * Marks the local invoice PAID and records the payment timestamp.
 */
async function handleInvoicePaid(
  payload: XeroWebhookPayload,
  integrationId: string,
): Promise<void> {
  // RA-1277: payment.created events ALWAYS have a resourceId (it's the
  // PaymentID, not the InvoiceID). The old gate `if (!resourceId)` never
  // fired, so every payment.created event was mistakenly treated as
  // invoice.paid and tried to match a local invoice on PaymentID ==
  // externalInvoiceId — which silently no-op'd (no match) or, worse,
  // matched the wrong invoice. Dispatch by resourceType instead.
  if (payload.resourceType === "PAYMENT") {
    await handlePaymentCreated(payload, integrationId);
    return;
  }

  const xeroInvoiceId = payload.resourceId;
  if (!xeroInvoiceId) {
    throw new Error("invoice.paid event missing resourceId (Xero InvoiceID)");
  }

  const invoice = await prisma.invoice.findFirst({
    where: { externalInvoiceId: xeroInvoiceId },
    select: { id: true, status: true, totalIncGST: true },
  });

  if (!invoice) {
    console.warn(
      `[Xero Webhook] invoice.paid for unknown Xero ID ${xeroInvoiceId} — skipping`,
    );
    return;
  }

  if (invoice.status === "PAID") {
    // Already marked paid — idempotent skip
    return;
  }

  // RA-855: invoice.paid means fully settled — set amountPaid = totalIncGST, amountDue = 0
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "PAID",
      paidDate: new Date(payload.eventDateUtc ?? Date.now()),
      amountPaid: invoice.totalIncGST ?? 0,
      amountDue: 0,
    },
  });

  console.log(
    `[Xero Webhook] invoice.paid → marked invoice ${invoice.id} as PAID`,
  );
}

/**
 * payment.created events carry a PaymentID rather than an InvoiceID.
 * Calls the Xero Payments endpoint to resolve the InvoiceID, then marks PAID.
 */
async function handlePaymentCreated(
  payload: XeroWebhookPayload,
  integrationId: string,
): Promise<void> {
  const paymentId = payload.resourceId;
  if (!paymentId) {
    throw new Error(
      "payment.created event missing resourceId (Xero PaymentID)",
    );
  }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration?.tenantId) {
    throw new Error(`Integration ${integrationId} missing tenantId`);
  }

  // Get a fresh token — RA-868 token manager handles refresh
  const accessToken = await getValidXeroToken(integrationId);

  // Resolve PaymentID → InvoiceID via Xero Payments API
  const res = await fetch(
    `https://api.xero.com/api.xro/2.0/Payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": integration.tenantId,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(
      `Xero Payments API error ${res.status} for payment ${paymentId}`,
    );
  }

  const data = await res.json();
  const xeroPayment = data?.Payments?.[0];
  const xeroInvoiceId: string | undefined = xeroPayment?.Invoice?.InvoiceID;

  if (!xeroInvoiceId) {
    console.warn(
      `[Xero Webhook] payment.created — no InvoiceID on payment ${paymentId}; may be a non-invoice payment`,
    );
    return;
  }

  // RA-855: Use Xero's AmountDue as source of truth for remaining balance (in dollars → cents)
  const amountDueCents = Math.round((xeroPayment?.Invoice?.AmountDue ?? 0) * 100);

  const invoice = await prisma.invoice.findFirst({
    where: { externalInvoiceId: xeroInvoiceId },
    select: { id: true, status: true, totalIncGST: true },
  });

  if (!invoice || invoice.status === "PAID") {
    return; // Not found or already paid — idempotent
  }

  const newAmountPaid = Math.max(0, (invoice.totalIncGST ?? 0) - amountDueCents);
  const isPaid = amountDueCents === 0;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaid: newAmountPaid,
      amountDue: amountDueCents,
      ...(isPaid
        ? { status: "PAID", paidDate: new Date(payload.eventDateUtc ?? Date.now()) }
        : {}),
    },
  });

  console.log(
    `[Xero Webhook] payment.created → updated invoice ${invoice.id}: amountPaid=${newAmountPaid} amountDue=${amountDueCents}${isPaid ? " (PAID)" : ""}`,
  );
}
