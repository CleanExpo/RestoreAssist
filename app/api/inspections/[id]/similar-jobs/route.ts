/**
 * GET /api/inspections/[id]/similar-jobs
 *
 * Returns semantically similar historical jobs from the pgvector index.
 * Powers scope pre-filling: "jobs like this one cost $X and used Y equipment."
 *
 * Query params:
 *   limit?      number  (default 5, max 20)
 *   claimType?  string  filter to matching claim type
 *
 * The query embedding is built from the inspection's classification + affected
 * areas + description. If the inspection has no data yet, a generic query is used.
 *
 * Returns:
 *   {
 *     results: SimilarJobResult[]
 *     count: number
 *     queryType: "inspection" | "generic"
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  embedText,
  buildJobEmbeddingText,
  findSimilarJobs,
} from "@/lib/ai/embeddings";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId } = await params;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5"), 20);
    const claimTypeFilter = url.searchParams.get("claimType") ?? undefined;

    // RA-1711 batch 3 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            category: true,
            class: true,
          },
        },
        affectedAreas: {
          select: {
            affectedSquareFootage: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const classification = inspection.classifications[0];
    // affectedSquareFootage is in sq ft → convert to m² (1 sq ft = 0.0929 m²)
    const totalAreaM2 = inspection.affectedAreas.reduce(
      (sum, a) => sum + (a.affectedSquareFootage ?? 0) * 0.0929,
      0,
    );
    const suburb = inspection.propertyAddress?.split(",")?.[1]?.trim() ?? "";

    // Inspection.claimType may exist as a scalar field (not in classifications)
    const inspectionAny = inspection as Record<string, unknown>;
    const inspectionClaimType =
      (inspectionAny.claimType as string | undefined) ?? null;

    // Build a query description from inspection data
    const queryInput = {
      claimType: claimTypeFilter ?? inspectionClaimType ?? "water_damage",
      waterCategory: classification?.category
        ? parseInt(classification.category)
        : undefined,
      waterClass: classification?.class
        ? parseInt(classification.class)
        : undefined,
      suburb: suburb || "Unknown",
      state: "QLD",
      description:
        (inspectionAny.lossDescription as string | undefined) ??
        `Water damage restoration job, ${totalAreaM2.toFixed(0)}m² affected`,
      jobName: `Inspection ${(inspection as Record<string, unknown>).inspectionNumber as string}`,
      totalExTax: 0,
      itemCount: 0,
      equipmentCount: 0,
    };

    const queryText = buildJobEmbeddingText(queryInput);

    // RA-6921 (P0) — embed with the workspace's own OpenAI key when
    // configured; degrade to the free hash-fallback rather than spend the
    // platform's key on a client's workload.
    let openaiApiKey = "";
    try {
      const workspaceKey = await resolveWorkspaceAiKey(
        session.user.id,
        "OPENAI",
      );
      openaiApiKey = workspaceKey.apiKey;
    } catch {
      // No workspace key configured — fall through to hash-fallback below.
    }
    const provider: "openai" | "hash-fallback" = openaiApiKey
      ? "openai"
      : "hash-fallback";
    const queryVector = await embedText(queryText, provider, openaiApiKey);

    // Search for similar jobs
    const results = await findSimilarJobs({
      queryVector,
      tenantId: session.user.id,
      claimType: claimTypeFilter,
      limit,
    });

    return NextResponse.json({
      results,
      count: results.length,
      queryType: classification ? "inspection" : "generic",
      provider,
    });
  } catch (error) {
    return fromException(request, error, { stage: "inspection-similar-jobs" });
  }
}
