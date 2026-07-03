/**
 * Disconnect Integration Route
 * POST /api/integrations/oauth/[provider]/disconnect
 * Disconnects an integration, revokes tokens at the provider where
 * supported, and clears local tokens.
 *
 * No subscription gate: RA-6968 — a user whose subscription has lapsed
 * (CANCELED/PAST_DUE) must still be able to disconnect/delete their own
 * integration data. Gating disconnect behind an active subscription trapped
 * lapsed users' tokens connected indefinitely.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  disconnectIntegration,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from "@/lib/integrations/oauth-handler";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
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

    const { provider: providerParam } = await params;
    const provider = providerParam.toUpperCase() as IntegrationProvider;

    // Validate provider
    if (!PROVIDER_CONFIG[provider]) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Invalid provider: ${providerParam}`,
        status: 400,
      });
    }

    // Find integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider,
      },
    });

    if (!integration) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Integration not found",
        status: 404,
      });
    }

    // Disconnect integration
    await disconnectIntegration(integration.id);

    // Optionally delete external data
    const body = await request.json().catch(() => ({}));
    if (body.deleteData) {
      await prisma.externalClient.deleteMany({
        where: {
          integrationId: integration.id,
          integration: { userId: session.user.id },
        },
      });
      await prisma.externalJob.deleteMany({
        where: {
          integrationId: integration.id,
          integration: { userId: session.user.id },
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `${PROVIDER_CONFIG[provider].name} disconnected successfully`,
    });
  } catch (error) {
    return fromException(request, error, { stage: "integration-disconnect" });
  }
}
