import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { listConfiguredAiConnections } from "@/lib/services/integrations/ai-connections";
import { INTEGRATION_METADATA_SELECT, integrationPublicMetadata } from "@/lib/services/integrations/public-metadata";
import { classifyIntegrationIdentity } from "@/lib/integrations/identity";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const effectiveOwner = await getOrganizationOwner(session.user.id) || session.user.id;
    const [rows, canonical] = await Promise.all([
      prisma.integration.findMany({
        where: { userId: { in: [...new Set([session.user.id, effectiveOwner])] } },
        select: { ...INTEGRATION_METADATA_SELECT, config: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 101,
      }),
      listConfiguredAiConnections(effectiveOwner),
    ]);
    // Shared AI settings use the effective owner; OAuth remains actor-owned.
    const visible = rows.slice(0, 100).filter(row => {
      const identity = classifyIntegrationIdentity(row);
      return identity.kind === "AI" ? row.userId === effectiveOwner : row.userId === session.user.id;
    });
    const credentialIds = visible.length ? await prisma.integration.findMany({
      where: { id: { in: visible.map(row => row.id) }, userId: session.user.id, accessToken: { not: null, notIn: [""] } },
      select: { id: true }, take: 100,
    }) : [];
    const configured = new Set(credentialIds.map(row => row.id));
    return NextResponse.json({
      integrations: visible.map(row => integrationPublicMetadata(row, configured.has(row.id))),
      aiConnections: canonical.connections, workspaceId: canonical.workspaceId,
      truncated: rows.length > 100,
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    return apiError(request, {
      code: "VALIDATION",
      message: "Configure AI providers in workspace provider connections, or use the provider's OAuth Connect action.",
      status: 400,
    });
  } catch (error) {
    return fromException(request, error, { stage: "create" });
  }
}
