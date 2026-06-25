import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDraft } from "@/lib/invoice-status";
import { syncInvoiceToXero } from "@/lib/integrations/xero";
import { syncInvoiceToQuickBooks } from "@/lib/integrations/quickbooks";
import { syncInvoiceToMYOB } from "@/lib/integrations/myob";
import { withIdempotency } from "@/lib/idempotency";
import {
  getSyncErrorMessage,
  INVOICE_SYNC_FAILURE_MESSAGE,
} from "@/lib/integrations/sync-error";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: syncing to Xero/QuickBooks/MYOB is an external API call that
  // creates invoice records downstream. Retry without idempotency creates
  // duplicate invoices in the accounting system.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { provider } = body;
      const normalizedProvider =
        typeof provider === "string" ? provider.toLowerCase() : "";

      if (!normalizedProvider) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Provider is required (xero, quickbooks, or myob)",
          status: 400,
        });
      }

      if (!["xero", "quickbooks", "myob"].includes(normalizedProvider)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Unsupported provider",
          status: 400,
        });
      }

      // Fetch invoice with all related data
      const invoice = await prisma.invoice.findUnique({
        where: {
          id,
          userId: userId,
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              description: true,
              category: true,
              quantity: true,
              unitPrice: true,
              xeroAccountCode: true,
              subtotal: true,
              gstRate: true,
              gstAmount: true,
              total: true,
              sortOrder: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        } as any,
      });

      if (!invoice) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }

      // Can't sync draft invoices
      if (isDraft(invoice.status)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Cannot sync draft invoices. Please send the invoice first.",
          status: 400,
        });
      }

      // Check if integration is connected
      const integration = await prisma.integration.findFirst({
        where: {
          userId: userId,
          provider: provider.toUpperCase(),
        },
      });

      if (!integration) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: `No ${provider} integration found. Please connect to ${provider} first.`,
          status: 404,
        });
      }

      if (integration.status !== "CONNECTED") {
        return apiError(request, {
          code: "VALIDATION",
          message: `${provider} integration is not connected. Please reconnect.`,
          status: 400,
        });
      }

      // Check if token is expired
      if (
        integration.tokenExpiresAt &&
        new Date(integration.tokenExpiresAt) < new Date()
      ) {
        return apiError(request, {
          code: "UNAUTHORIZED",
          message: `${provider} access token has expired. Please reconnect.`,
          status: 401,
        });
      }

      // Update invoice sync status to PENDING
      await prisma.invoice.update({
        where: { id, userId },
        data: {
          externalSyncStatus: "PENDING",
          externalSyncProvider: provider.toLowerCase(),
          externalSyncError: null,
        },
      });

      // Create audit log
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: id,
          userId: userId,
          action: "sync_initiated",
          description: `Started sync to ${provider}`,
          metadata: {
            provider,
          },
        },
      });

      // Sync to accounting software based on provider
      let externalInvoiceId = "";
      let syncResult: any;

      try {
        switch (provider.toLowerCase()) {
          case "xero":
            syncResult = await syncInvoiceToXero(invoice, integration);
            externalInvoiceId = syncResult.invoiceId;
            break;

          case "quickbooks":
            syncResult = await syncInvoiceToQuickBooks(invoice, integration);
            externalInvoiceId = syncResult.invoiceId;
            break;

          case "myob":
            syncResult = await syncInvoiceToMYOB(invoice, integration);
            externalInvoiceId = syncResult.invoiceId;
            break;
        }

        if (!externalInvoiceId) {
          throw new Error("Provider did not return an invoice ID");
        }

        // Update invoice with external reference and success status
        await prisma.invoice.update({
          where: { id, userId },
          data: {
            externalInvoiceId,
            externalSyncStatus: "SYNCED",
            externalSyncedAt: new Date(),
            externalSyncError: null,
          },
        });

        // Update integration last sync time
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            lastSyncAt: new Date(),
            syncError: null,
          },
        });

        // Create success audit log
        await prisma.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: userId,
            action: "sync_completed",
            description: `Successfully synced to ${provider}`,
            metadata: {
              provider,
              externalInvoiceId,
              ...syncResult,
            },
          },
        });

        // Create integration sync log
        await prisma.integrationSyncLog.create({
          data: {
            integrationId: integration.id,
            syncType: "INVOICE",
            status: "SUCCESS",
            recordsProcessed: 1,
            recordsFailed: 0,
            completedAt: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          message: `Invoice synced successfully to ${provider}`,
          externalInvoiceId,
          syncResult,
        });
      } catch (syncError: unknown) {
        const syncErrorMessage = getSyncErrorMessage(syncError);
        console.error(`Error syncing to ${provider}:`, syncError);

        // Update invoice with error status
        await prisma.invoice.update({
          where: { id, userId },
          data: {
            externalSyncStatus: "FAILED",
            externalSyncError: INVOICE_SYNC_FAILURE_MESSAGE,
          },
        });

        // Update integration with error
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            syncError: INVOICE_SYNC_FAILURE_MESSAGE,
          },
        });

        // Create error audit log
        await prisma.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: userId,
            action: "sync_failed",
            description: `Failed to sync to ${provider}`,
            metadata: {
              provider,
              error: syncErrorMessage,
            },
          },
        });

        // Create integration sync log
        await prisma.integrationSyncLog.create({
          data: {
            integrationId: integration.id,
            syncType: "INVOICE",
            status: "FAILED",
            recordsProcessed: 0,
            recordsFailed: 1,
            errorMessage: INVOICE_SYNC_FAILURE_MESSAGE,
            completedAt: new Date(),
          },
        });

        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: INVOICE_SYNC_FAILURE_MESSAGE,
          status: 500,
          err: syncError,
          stage: "sync-provider",
        });
      }
    } catch (error: any) {
      console.error("Error in invoice sync:", error);
      return fromException(request, error, { stage: "sync" });
    }
  });
}

// GET - Check sync status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        externalInvoiceId: true,
        externalSyncProvider: true,
        externalSyncStatus: true,
        externalSyncedAt: true,
        externalSyncError: true,
      },
    });

    if (!invoice) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    return NextResponse.json({
      externalInvoiceId: invoice.externalInvoiceId,
      provider: invoice.externalSyncProvider,
      status: invoice.externalSyncStatus,
      syncedAt: invoice.externalSyncedAt,
      error: invoice.externalSyncError,
    });
  } catch (error: any) {
    console.error("Error getting sync status:", error);
    return fromException(request, error, { stage: "sync-status" });
  }
}
