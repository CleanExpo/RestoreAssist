/**
 * Sync Integration Route
 * POST /api/integrations/oauth/[provider]/sync
 * Triggers data sync for clients and/or jobs
 *
 * REQUIRES: Active paid subscription
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectOAuthIntegration } from "@/lib/services/integrations/select-oauth";
import {
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from "@/lib/integrations/oauth-handler";
import { createXeroClient } from "@/lib/integrations/xero/client";
import { createClientForIntegration } from "@/lib/integrations";
import {
  checkIntegrationAccess,
  createSubscriptionRequiredResponse,
} from "@/lib/integrations/subscription-guard";
import { apiError, fromException } from "@/lib/api-errors";
import { requireAddon } from "@/lib/entitlements";
import {
  BOOKKEEPING_SKU,
  isBookkeepingProvider,
} from "@/lib/billing/bookkeeping-addon";
import { mapXeroUpstreamError } from "@/lib/integrations/xero/upstream-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  let provider: IntegrationProvider | undefined;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id, (await params).provider);
    if (!subscriptionCheck.isAllowed) {
      return NextResponse.json(
        createSubscriptionRequiredResponse(subscriptionCheck),
        { status: 403 },
      );
    }

    const { provider: providerParam } = await params;
    provider = providerParam.toUpperCase() as IntegrationProvider;

    // Validate provider
    if (!PROVIDER_CONFIG[provider]) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Invalid provider: ${providerParam}`,
        status: 400,
      });
    }

    // RA-6920 B3 — triggering a sync for Xero/QuickBooks/MYOB requires the
    // BOOKKEEPING add-on. Existing connections are grandfathered (see
    // scripts/grandfather-bookkeeping-addon.ts).
    if (isBookkeepingProvider(provider)) {
      const addonGate = await requireAddon(session.user.id, BOOKKEEPING_SKU);
      if (!addonGate.allowed) return addonGate.response;
    }

    // Find integration — allow ERROR/SYNCING so a failed sync can be retried
    // without forcing a full OAuth reconnect (tokens are still present).
    const selection = await selectOAuthIntegration({
      prisma, userId: session.user.id, provider, requireReady: true,
      workspaceId: subscriptionCheck.foundingTrialWorkspaceId,
    });
    if (!selection.ok && selection.reason !== "NOT_FOUND") {
      return apiError(request, {
        code: "VALIDATION",
        message: selection.reason === "AMBIGUOUS"
          ? "Multiple connections require an explicit workspace selection."
          : selection.reason === "NOT_READY"
            ? "This connection needs valid credentials and an authorised organisation before syncing."
            : "This provider is not supported by the OAuth integration route.",
        status: selection.reason === "INVALID_PROVIDER" ? 400 : 409,
      });
    }
    const integration = selection.ok ? selection.data : null;

    if (!integration) {
      if (subscriptionCheck.foundingTrialWorkspaceId) {
        const existing = await selectOAuthIntegration({
          prisma, userId: session.user.id, provider, requireReady: false,
        });
        if (existing.ok || existing.reason === "AMBIGUOUS") {
          return apiError(request, {
            code: "VALIDATION",
            message: "This connection needs an explicit workspace selection before syncing.",
            status: 409,
          });
        }
      }
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Integration not found or not connected",
        status: 404,
      });
    }

    // Parse request body for sync type
    const body = await request.json().catch(() => ({}));
    const syncClients = body.syncClients !== false;
    const syncJobs = body.syncJobs !== false;

    if (provider === "XERO") {
      const client = await createXeroClient(integration.id);
      const { clientsCount, jobsCount } = await client.syncWithLifecycle(
        { syncClients, syncJobs },
        { expectedTenantId: integration.tenantId ?? undefined, expectedUserId: session.user.id, expectedWorkspaceId: integration.workspaceId },
      );
      return NextResponse.json({
        success: true, clientsSynced: clientsCount, jobsSynced: jobsCount,
        message: `Synced ${clientsCount} clients and ${jobsCount} jobs from Xero`,
      });
    }

    // Update status to syncing
    await prisma.integration.update({
      where: { id: integration.id, userId: session.user.id },
      data: { status: "SYNCING" },
    });

    try {
      // Create client and sync
      const client = await createClientForIntegration(integration.id);

      let clientsCount = 0;
      let jobsCount = 0;

      if (syncClients) {
        clientsCount = await client.syncClients();
      }

      if (syncJobs) {
        jobsCount = await client.syncJobs();
      }

      // Update status back to connected
      await prisma.integration.update({
        where: { id: integration.id, userId: session.user.id },
        data: {
          status: "CONNECTED",
          lastSyncAt: new Date(),
          syncError: null,
        },
      });

      return NextResponse.json({
        success: true,
        clientsSynced: clientsCount,
        jobsSynced: jobsCount,
        message: `Synced ${clientsCount} clients and ${jobsCount} jobs from ${PROVIDER_CONFIG[provider].name}`,
      });
    } catch (syncError) {
      // Update status to error
      const errorMessage =
        syncError instanceof Error ? syncError.message : String(syncError);
      await prisma.integration.update({
        where: { id: integration.id, userId: session.user.id },
        data: {
          status: "ERROR",
          syncError: errorMessage,
        },
      });

      throw syncError;
    }
  } catch (error) {
    if (provider === "XERO") {
      const upstream = mapXeroUpstreamError(error);
      if (upstream) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: upstream.message,
          status: upstream.status,
          err: error,
          stage: "sync",
          context: { xeroKind: upstream.kind },
        });
      }
    }
    return fromException(request, error, { stage: "sync" });
  }
}
