import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import { verifyCronAuth } from "@/lib/cron/auth";

/**
 * GET /api/cron/sync-invoices - Scheduled invoice sync cron job
 *
 * This endpoint should be called by:
 * - Vercel Cron (hourly): 0 * * * *
 * - Or external cron service
 *
 * Automatically syncs modified invoices to connected accounting systems
 *
 * Requires CRON_SECRET for security
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    // Find all active integrations
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
    });

    if (integrations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active integrations",
        stats: {
          integrations: 0,
          invoicesQueued: 0,
        },
      });
    }

    let totalQueued = 0;

    // For each integration, find invoices that need syncing
    for (const integration of integrations) {
      try {
        // Determine sync window (since last sync or last 24 hours)
        const syncWindow =
          integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Find invoices modified since last sync
        const invoices = await prisma.invoice.findMany({
          where: {
            userId: integration.userId,
            status: {
              not: "DRAFT", // Don't sync drafts
            },
            updatedAt: {
              gte: syncWindow,
            },
            // Exclude invoices that were already synced to this provider
            // and haven't been modified since
            OR: [
              {
                externalInvoiceId: null, // Never synced
              },
              {
                externalSyncProvider: {
                  not: integration.provider, // Synced to different provider
                },
              },
              {
                updatedAt: {
                  gte: integration.lastSyncAt || new Date(0), // Modified since last sync
                },
              },
            ],
          },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
          },
          take: 50, // Limit to 50 per integration per run
        });

        if (invoices.length === 0) {
          continue;
        }

        // Queue each invoice for sync
        for (const invoice of invoices) {
          try {
            // Use NORMAL priority for scheduled syncs
            await queueInvoiceSync(invoice.id, integration.provider, "NORMAL");
            totalQueued++;
          } catch (error) {
            console.error(
              `[Invoice Sync Cron] Failed to queue invoice ${invoice.id}:`,
              error,
            );
          }
        }

        // Update last sync time
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

    return NextResponse.json({
      success: true,
      stats: {
        integrations: integrations.length,
        invoicesQueued: totalQueued,
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
