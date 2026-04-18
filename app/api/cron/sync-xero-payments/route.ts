import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { getValidXeroToken } from "@/lib/integrations/xero/token-manager";
import { processXeroWebhookBatch } from "@/lib/integrations/xero/webhook-processor";

/**
 * GET /api/cron/sync-xero-payments — Fallback payment reconciliation for Xero
 *
 * This cron job is the safety net for missed webhook events (Xero webhooks can
 * fail or be delayed). It:
 *   1. Processes any PENDING WebhookEvent rows via the webhook-processor (RA-871).
 *   2. Polls Xero for AUTHORISED invoices that should now be PAID (up to 50 per run).
 *
 * Called by Vercel Cron (every 4h): 0 * /4 * * *
 * Secured by CRON_SECRET bearer token via verifyCronAuth (timing-safe comparison).
 *
 * Integration rule: sync failures NEVER block user-facing operations.
 * This route always returns 200 with structured stats — never 5xx.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // RA-1315: wrap in runCronJob so parallel 4h-cron invocations (e.g. during
  // a slow Xero poll) don't both reconcile the same invoices.
  const jobResult = await runCronJob("sync-xero-payments", async () => {
    return await syncXeroPaymentsOnce();
  });

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

async function syncXeroPaymentsOnce() {
  const stats = {
    webhookEventsProcessed: 0,
    webhookEventsFailed: 0,
    webhookEventsSkipped: 0,
    invoicesPolled: 0,
    invoicesMarkedPaid: 0,
    integrationErrors: 0,
  };

  // ── Phase 1: Drain pending webhook events ────────────────────────────────
  try {
    const batchResult = await processXeroWebhookBatch(50);
    stats.webhookEventsProcessed = batchResult.processed;
    stats.webhookEventsFailed = batchResult.failed;
    stats.webhookEventsSkipped = batchResult.skipped;
  } catch (err) {
    console.error("[Xero Payment Sync] Webhook batch processing error:", err);
    // Non-fatal — continue to polling phase
  }

  // ── Phase 2: Fallback polling — find AUTHORISED invoices and check if paid ─
  const xeroIntegrations = await prisma.integration.findMany({
    where: {
      provider: "XERO",
      status: "CONNECTED",
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
    },
  });

  for (const integration of xeroIntegrations) {
    if (!integration.tenantId) continue;

    try {
      // Get a fresh access token (RA-868 token manager handles refresh transparently)
      const accessToken = await getValidXeroToken(integration.id);

      // Find local invoices that are AUTHORISED (sent to Xero) but not yet PAID,
      // limited to 50 per integration to stay within cron time budget
      const pendingInvoices = await prisma.invoice.findMany({
        where: {
          userId: integration.userId,
          status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] },
          externalInvoiceId: { not: null },
          externalSyncProvider: "XERO",
        },
        select: {
          id: true,
          externalInvoiceId: true,
        },
        take: 50,
        orderBy: { updatedAt: "asc" }, // oldest-first: most likely to be paid
      });

      stats.invoicesPolled += pendingInvoices.length;

      for (const invoice of pendingInvoices) {
        if (!invoice.externalInvoiceId) continue;

        try {
          // Poll Xero for the current invoice status
          const res = await fetch(
            `https://api.xero.com/api.xro/2.0/Invoices/${invoice.externalInvoiceId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Xero-tenant-id": integration.tenantId!,
                Accept: "application/json",
              },
            },
          );

          if (!res.ok) {
            // 404 means the invoice was deleted/voided in Xero — skip gracefully
            if (res.status === 404) {
              console.warn(
                `[Xero Payment Sync] Invoice ${invoice.externalInvoiceId} not found in Xero (404) — skipping`,
              );
              continue;
            }
            throw new Error(
              `Xero API ${res.status} for invoice ${invoice.externalInvoiceId}`,
            );
          }

          const data = await res.json();
          const xeroInvoice = data?.Invoices?.[0];

          if (!xeroInvoice) continue;

          // Xero status PAID or AmountDue === 0 means fully settled
          if (xeroInvoice.Status === "PAID" || xeroInvoice.AmountDue === 0) {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "PAID",
                paidDate: xeroInvoice.FullyPaidOnDate
                  ? new Date(xeroInvoice.FullyPaidOnDate)
                  : new Date(),
              },
            });
            stats.invoicesMarkedPaid++;
            console.log(
              `[Xero Payment Sync] Polled PAID → invoice ${invoice.id} (Xero ${invoice.externalInvoiceId})`,
            );
          }
        } catch (invoiceErr) {
          // Single-invoice error — log and continue; do not abort the integration run
          console.error(
            `[Xero Payment Sync] Error checking invoice ${invoice.id}:`,
            invoiceErr,
          );
        }
      }
    } catch (integrationErr) {
      stats.integrationErrors++;
      console.error(
        `[Xero Payment Sync] Error processing integration ${integration.id}:`,
        integrationErr,
      );
      // Do not abort — process remaining integrations
    }
  }

  return {
    itemsProcessed: stats.webhookEventsProcessed + stats.invoicesMarkedPaid,
    metadata: stats,
  };
}

/**
 * POST /api/cron/sync-xero-payments — Manual trigger (same auth, useful for testing)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
