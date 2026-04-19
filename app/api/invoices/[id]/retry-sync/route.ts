import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import { IntegrationProvider } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";

/**
 * POST /api/invoices/[id]/retry-sync - Manually retry failed invoice sync
 *
 * Allows users to manually retry failed sync operations
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: retry-sync queues a sync job — double-click would queue
  // the same job twice and duplicate the downstream invoice write.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const { provider } = body;

      if (!provider) {
        return NextResponse.json(
          { error: "Provider is required" },
          { status: 400 },
        );
      }

      const validProviders: IntegrationProvider[] = [
        "XERO",
        "QUICKBOOKS",
        "MYOB",
        "SERVICEM8",
        "ASCORA",
      ];

      if (!validProviders.includes(provider as IntegrationProvider)) {
        return NextResponse.json(
          { error: "Invalid provider" },
          { status: 400 },
        );
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id, userId },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 },
        );
      }

      const integration = await prisma.integration.findFirst({
        where: {
          userId,
          provider: provider as IntegrationProvider,
          status: "CONNECTED",
        },
      });

      if (!integration) {
        return NextResponse.json(
          { error: `${provider} integration not connected` },
          { status: 400 },
        );
      }

      const jobId = await queueInvoiceSync(
        invoice.id,
        provider as IntegrationProvider,
        "HIGH",
      );

      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          userId,
          action: "sync_retry",
          description: `Manual retry of sync to ${provider}`,
          metadata: { provider, jobId },
        },
      });

      return NextResponse.json({
        success: true,
        jobId,
        message: `Sync to ${provider} queued for retry`,
      });
    } catch (error: any) {
      console.error("[Retry Sync] Error retrying sync:", error);
      return NextResponse.json(
        { success: false, error: "Failed to retry sync" },
        { status: 500 },
      );
    }
  });
}
