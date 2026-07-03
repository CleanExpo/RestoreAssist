/**
 * External Clients Route
 * GET /api/integrations/oauth/[provider]/clients - List synced clients
 * POST /api/integrations/oauth/[provider]/clients - Import selected clients
 *
 * REQUIRES: Active paid subscription
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from "@/lib/integrations/oauth-handler";
import {
  checkIntegrationAccess,
  createSubscriptionRequiredResponse,
} from "@/lib/integrations/subscription-guard";
import { INTEGRATION_IMPORT_FAILURE_MESSAGE } from "@/lib/integrations/sync-error";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
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

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id);
    if (!subscriptionCheck.isAllowed) {
      return NextResponse.json(
        createSubscriptionRequiredResponse(subscriptionCheck),
        { status: 403 },
      );
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

    // Get synced clients
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const search = searchParams.get("search") || "";

    const where = {
      integrationId: integration.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [clients, total] = await Promise.all([
      prisma.externalClient.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.externalClient.count({ where }),
    ]);

    return NextResponse.json({
      clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "integration-clients-list" });
  }
}

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

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id);
    if (!subscriptionCheck.isAllowed) {
      return NextResponse.json(
        createSubscriptionRequiredResponse(subscriptionCheck),
        { status: 403 },
      );
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

    const body = await request.json();
    const { clientIds } = body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "clientIds array is required",
        status: 400,
      });
    }

    if (clientIds.length > 100) {
      return apiError(request, {
        code: "VALIDATION",
        message: "clientIds is limited to 100 entries per request",
        status: 400,
      });
    }

    // Get external clients
    const externalClients = await prisma.externalClient.findMany({
      where: {
        integrationId: integration.id,
        externalId: { in: clientIds },
      },
      take: clientIds.length,
    });

    // Import to contacts
    const imported: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const externalClient of externalClients) {
      try {
        // Idempotent re-import: if this external record is already linked to
        // a Client that still exists, don't create another one.
        if (externalClient.contactId) {
          const existingLink = await prisma.client.findFirst({
            where: { id: externalClient.contactId, userId: session.user.id },
            select: { id: true },
          });
          if (existingLink) {
            imported.push(externalClient.externalId);
            continue;
          }
        }

        // Client.email is required and unique per (userId, email). External
        // records without an email would otherwise all collide on "" - give
        // each one a stable per-record placeholder instead.
        const email =
          externalClient.email && externalClient.email.trim()
            ? externalClient.email.trim()
            : `ext-${integration.id}-${externalClient.externalId}@client.local`;

        // Find-or-create so re-syncing the same external contact (by email)
        // links back to the same Client rather than duplicating it.
        const client = await prisma.client.upsert({
          where: { userId_email: { userId: session.user.id, email } },
          update: {
            name: externalClient.name,
            phone: externalClient.phone,
            address: externalClient.address,
          },
          create: {
            userId: session.user.id,
            name: externalClient.name,
            email,
            phone: externalClient.phone,
            address: externalClient.address,
          },
        });

        // Link external client to the client record
        await prisma.externalClient.update({
          where: { id: externalClient.id },
          data: { contactId: client.id },
        });

        imported.push(externalClient.externalId);
      } catch (err) {
        console.error("External client import error:", err);
        errors.push({
          id: externalClient.externalId,
          error: INTEGRATION_IMPORT_FAILURE_MESSAGE,
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      errors,
      message: `Imported ${imported.length} clients from ${PROVIDER_CONFIG[provider].name}`,
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "integration-clients-import",
    });
  }
}
