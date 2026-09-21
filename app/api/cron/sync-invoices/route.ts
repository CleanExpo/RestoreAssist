import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";

export const maxDuration = 300;

const MAX_INTEGRATIONS_PER_CRON_RUN = 100;
const MAX_INVOICES_PER_INTEGRATION = 50;

/**
 * GET /api/cron/sync-invoices — Hourly invoice-sync backstop (RA-7454)
 *
 * Scheduled in vercel.json as `0 * * * *`. Webhook + manual retry still
 * cover the live path; this sweep re-queues invoices that changed while an
 * integration was down or a webhook was missed.
 *
 * Wrapped in runCronJob so CronJobRun rows feed the watchdog.
 * Auth: CRON_SECRET via verifyCronAuth.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const jobResult = await runCronJob("sync-invoices", syncInvoicesOnce);

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/cron/sync-invoices — Manual trigger (same auth + work as GET)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

async function syncInvoicesOnce() {
  const integrations = await prisma.integration.findMany({
    where: {
      status: "CONNECTED",
      provider: {
        in: ["XERO", "QUICKBOOKS", "MYOB"],
      },
    },
    select: {
      id: true,
      provider: true,
      userId: true,
      lastSyncAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_INTEGRATIONS_PER_CRON_RUN,
  });

  if (integrations.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: {
        integrations: 0,
        invoicesQueued: 0,
        reason: "No active integrations",
      },
    };
  }

  let totalQueued = 0;

  for (const integration of integrations) {
    try {
      const syncWindow =
        integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

      const invoices = await prisma.invoice.findMany({
        where: {
          userId: integration.userId,
          status: {
            not: "DRAFT",
          },
          updatedAt: {
            gte: syncWindow,
          },
          OR: [
            {
              externalInvoiceId: null,
            },
            {
              externalSyncProvider: {
                not: integration.provider,
              },
            },
            {
              updatedAt: {
                gte: integration.lastSyncAt || new Date(0),
              },
            },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
        },
        orderBy: { updatedAt: "asc" },
        take: MAX_INVOICES_PER_INTEGRATION,
      });

      if (invoices.length === 0) {
        continue;
      }

      for (const invoice of invoices) {
        try {
          await queueInvoiceSync(invoice.id, integration.provider, "NORMAL");
          totalQueued++;
        } catch (error) {
          console.error(
            `[Invoice Sync Cron] Failed to queue invoice ${invoice.id}:`,
            error,
          );
        }
      }

      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
    } catch (error) {
      console.error(
        `[Invoice Sync Cron] Error processing integration ${integration.id}:`,
        error,
      );
    }
  }

  return {
    itemsProcessed: totalQueued,
    metadata: {
      integrations: integrations.length,
      invoicesQueued: totalQueued,
    },
  };
}
