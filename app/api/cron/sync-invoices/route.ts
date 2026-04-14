import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  queueInvoiceSync,
  processNextBatch,
} from "@/lib/integrations/sync-queue";
import { verifyCronAuth } from "@/lib/cron/auth";

/**
 * GET /api/cron/sync-invoices - Scheduled invoice sync cron job
 *
 * Phase 1: Enqueue any invoices that have been modified since last sync.
 * Phase 2: Process up to 20 PENDING jobs from the durable InvoiceSyncJob table.
 *
 * Called by Vercel Cron (hourly): 0 * * * *
 * Requires CRON_SECRET for security (timing-safe via verifyCronAuth)
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    // ── Phase 1: discover invoices that need syncing ──────────────────────────
    const integrations = await prisma.integration.findMany({
      where: {
        status: "CONNECTED",
        provider: { in: ["XERO", "QUICKBOOKS", "MYOB"] },
      },
      select: {
        id: true,
        provider: true,
        userId: true,
        lastSyncAt: true,
      },
    });

    let totalQueued = 0;

    for (const integration of integrations) {
      try {
        const syncWindow =
          integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

        const invoices = await prisma.invoice.findMany({
          where: {
            userId: integration.userId,
            status: { not: "DRAFT" },
            updatedAt: { gte: syncWindow },
            OR: [
              { externalInvoiceId: null },
              { externalSyncProvider: { not: integration.provider } },
              { updatedAt: { gte: integration.lastSyncAt || new Date(0) } },
            ],
          },
          select: { id: true },
          take: 50,
        });

        for (const invoice of invoices) {
          try {
            await queueInvoiceSync(invoice.id, integration.provider, "NORMAL");
            totalQueued++;
          } catch (err) {
            console.error(
              `[Invoice Sync Cron] Failed to enqueue invoice ${invoice.id}:`,
              err,
            );
          }
        }

        await prisma.integration.update({
          where: { id: integration.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (err) {
        console.error(
          `[Invoice Sync Cron] Error scanning integration ${integration.id}:`,
          err,
        );
      }
    }

    // ── Phase 2: process the durable queue ───────────────────────────────────
    const batchResult = await processNextBatch({ maxJobs: 20 });

    return NextResponse.json({
      success: true,
      stats: {
        integrations: integrations.length,
        invoicesQueued: totalQueued,
        ...batchResult,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Invoice Sync Cron] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/cron/sync-invoices - Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  // Same logic as GET, allows manual triggering
  return GET(request);
}
