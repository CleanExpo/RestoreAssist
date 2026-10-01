import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INTEGRATION_METADATA_SELECT, integrationPublicMetadata } from "@/lib/services/integrations/public-metadata";
import { classifyIntegrationIdentity } from "@/lib/integrations/identity";
import { recordMutationAudit } from "@/lib/audit-log";
import { apiError, fromException } from "@/lib/api-errors";

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

    const integration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: { ...INTEGRATION_METADATA_SELECT, config: true },
    });

    if (!integration) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Integration not found",
        status: 404,
      });
    }

    return NextResponse.json(integrationPublicMetadata(integration));
  } catch (error) {
    return fromException(request, error, { stage: "integration-get" });
  }
}

export async function PUT(
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
    const body = await request.json();
    const { name, description, icon, apiKey, config, status } = body;

    // Check if integration exists and belongs to user
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: { ...INTEGRATION_METADATA_SELECT, config: true },
    });

    if (!existingIntegration) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Integration not found",
        status: 404,
      });
    }

    const identity = classifyIntegrationIdentity(existingIntegration);
    const nextIdentity = classifyIntegrationIdentity({ ...existingIntegration, name: name ?? existingIntegration.name, icon: icon ?? existingIntegration.icon });
    if (apiKey !== undefined || config !== undefined || identity.kind !== "AI" ||
        (name !== undefined && name !== existingIntegration.name) ||
        (icon !== undefined && icon !== existingIntegration.icon) ||
        existingIntegration.tenantId || existingIntegration.realmId || existingIntegration.companyId || existingIntegration.tokenExpiresAt ||
        nextIdentity.kind !== identity.kind || nextIdentity.provider !== identity.provider ||
        (status !== undefined && status !== "DISCONNECTED")) {
      return apiError(request, { code: "VALIDATION", status: 400,
        message: "Use workspace provider connections to configure AI, or the provider OAuth controls to change a connection." });
    }
    const oauthCredential = await prisma.integration.findFirst({
      where: { id, userId: session.user.id, accessToken: { not: null, notIn: [""] } },
      select: { id: true },
    });
    if (oauthCredential) {
      return apiError(request, { code: "VALIDATION", status: 409,
        message: "This record has conflicting integration identity. Review its provider connection before changing it." });
    }
    const integration = await prisma.integration.update({
      where: { id, userId: session.user.id },
      data: { name, description, icon, ...(status ? { status: "DISCONNECTED" } : {}) },
      select: { ...INTEGRATION_METADATA_SELECT, config: true },
    });

    await recordMutationAudit({
      resource: "integration",
      resourceId: id,
      verb: "UPDATE",
      action: "integration.update",
      actorUserId: session.user.id,
      metadata: {
        provider: existingIntegration.provider,
        statusChanged: existingIntegration.status !== integration.status,
        newStatus: integration.status,
      },
      request,
    });

    return NextResponse.json(integrationPublicMetadata(integration));
  } catch (error) {
    return fromException(request, error, { stage: "integration-put" });
  }
}

export async function DELETE(
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

    // Check if integration exists and belongs to user
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: { ...INTEGRATION_METADATA_SELECT, config: true },
    });

    if (!existingIntegration) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Integration not found",
        status: 404,
      });
    }

    await prisma.integration.delete({
      where: { id, userId: session.user.id },
    });

    await recordMutationAudit({
      resource: "integration",
      resourceId: id,
      verb: "DELETE",
      action: "integration.delete",
      actorUserId: session.user.id,
      metadata: { provider: existingIntegration.provider },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "integration-delete" });
  }
}
