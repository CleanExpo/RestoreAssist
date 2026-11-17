import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OAUTH_CANDIDATE_WHERE } from "@/lib/services/integrations/select-oauth";
import { isOAuthIntegration } from "@/lib/integrations/identity";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import { processZohoSyncBatch } from "@/lib/integrations/zoho/queue";
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

const ACCOUNTING_INTEGRATION_WHERE = {
  ...OAUTH_CANDIDATE_WHERE,
  status: "CONNECTED",
  provider: {
    in: ["XERO", "QUICKBOOKS", "MYOB"],
  },
} satisfies Prisma.IntegrationWhereInput;

const INTEGRATION_SELECT = {
  name: true, icon: true, config: true, workspaceId: true,
  tokenExpiresAt: true, realmId: true, companyId: true,
  id: true,
  provider: true,
  userId: true,
  tenantId: true, lastSyncAt: true,
  invoiceSyncCursor: { select: { cursorAt: true, cursorId: true } },
} satisfies Prisma.IntegrationSelect;

/**
 * RA-8428: integrations never visited come first, then the least recently
 * swept, so every connected integration is reached even past the per-run cap.
 */
async function selectIntegrationsToSweep() {
  const unswept = await prisma.integration.findMany({
    where: { ...ACCOUNTING_INTEGRATION_WHERE, invoiceSyncCursor: { is: null } },
    select: INTEGRATION_SELECT,
    orderBy: { id: "asc" },
    take: MAX_INTEGRATIONS_PER_CRON_RUN,
  });
  const room = MAX_INTEGRATIONS_PER_CRON_RUN - unswept.length;
  if (room <= 0) return unswept;
  const swept = await prisma.integration.findMany({
    where: {
      ...ACCOUNTING_INTEGRATION_WHERE,
      invoiceSyncCursor: { isNot: null },
    },
    select: INTEGRATION_SELECT,
    orderBy: [{ invoiceSyncCursor: { sweptAt: "asc" } }, { id: "asc" }],
    take: room,
  });
  return [...unswept, ...swept];
}

async function syncInvoicesOnce() {
  const integrations = await selectIntegrationsToSweep();

  const zoho = await drainZoho();

  if (integrations.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: {
        integrations: 0,
        invoicesQueued: 0,
        zohoProcessed: zoho.processed,
        zohoFailed: zoho.failed,
        reason: "No active integrations",
      },
    };
  }

  let totalQueued = 0;

  for (const integration of integrations) {
    const sweptAt = new Date();
    // RA-8428: the cursor is this cron's own (updatedAt, id) keyset position.
    // Integration.lastSyncAt is written by the manual Sync button, client
    // import and OAuth too, so it only seeds a cursor that does not exist yet.
    let cursorAt =
      integration.invoiceSyncCursor?.cursorAt ??
      integration.lastSyncAt ??
      new Date(sweptAt.getTime() - 24 * 60 * 60 * 1000);
    let cursorId = integration.invoiceSyncCursor?.cursorId ?? null;

    try {
      if (isOAuthIntegration(integration)) {
        const invoices = await prisma.invoice.findMany({
          where: {
            userId: integration.userId,
            workspaceId: integration.workspaceId,
            status: {
              not: "DRAFT",
            },
            OR:
              cursorId === null
                ? [{ updatedAt: { gte: cursorAt } }]
                : [
                    { updatedAt: { gt: cursorAt } },
                    { updatedAt: cursorAt, id: { gt: cursorId } },
                  ],
          },
          select: {
            id: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: MAX_INVOICES_PER_INTEGRATION,
        });

        for (const invoice of invoices) {
          try {
            await queueInvoiceSync(invoice.id, integration.provider, "NORMAL");
          } catch (error) {
            // Stop here so the cursor never moves past an invoice that was
            // not queued; the next run starts again from this invoice.
            console.error(
              `[Invoice Sync Cron] Failed to queue invoice ${invoice.id}:`,
              error,
            );
            break;
          }
          totalQueued++;
          cursorAt = invoice.updatedAt;
          cursorId = invoice.id;
        }
      }
    } catch (error) {
      console.error(
        `[Invoice Sync Cron] Error processing integration ${integration.id}:`,
        error,
      );
    }

    try {
      await prisma.invoiceSyncCursor.upsert({
        where: { integrationId: integration.id },
        create: { integrationId: integration.id, cursorAt, cursorId, sweptAt },
        update: { cursorAt, cursorId, sweptAt },
      });
    } catch (error) {
      console.error(
        `[Invoice Sync Cron] Failed to save cursor for integration ${integration.id}:`,
        error,
      );
    }
  }

  return {
    itemsProcessed: totalQueued,
    metadata: {
      integrations: integrations.length,
      invoicesQueued: totalQueued,
      zohoProcessed: zoho.processed,
      zohoFailed: zoho.failed,
    },
  };
}

async function drainZoho(): Promise<{ processed: number; failed: number }> {
  try {
    return await processZohoSyncBatch();
  } catch (error) {
    console.error(
      "[Invoice Sync Cron] Zoho outbound drain failed",
      error instanceof Error ? error.message : "error",
    );
    return { processed: 0, failed: 0 };
  }
}
