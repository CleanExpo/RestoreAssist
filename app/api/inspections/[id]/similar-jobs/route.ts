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

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { embedText, buildJobEmbeddingText, findSimilarJobs } from "@/lib/ai/embeddings"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = await params
    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5"), 20)
    const claimTypeFilter = url.searchParams.get("claimType") ?? undefined

    // Load inspection with classification + affected areas
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      include: {
        classifications: { orderBy: { createdAt: "desc" }, take: 1 },
        affectedAreas: true,
      },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const classification = inspection.classifications[0]
    // affectedSquareFootage is in sq ft → convert to m² (1 sq ft = 0.0929 m²)
    const totalAreaM2 = inspection.affectedAreas.reduce((sum, a) => sum + (a.affectedSquareFootage ?? 0) * 0.0929, 0)
    const suburb = inspection.propertyAddress?.split(",")?.[1]?.trim() ?? ""

    // Inspection.claimType may exist as a scalar field (not in classifications)
    const inspectionAny = inspection as Record<string, unknown>
    const inspectionClaimType = (inspectionAny.claimType as string | undefined) ?? null

    // Build a query description from inspection data
    const queryInput = {
      claimType: claimTypeFilter ?? inspectionClaimType ?? "water_damage",
      waterCategory: classification?.category ? parseInt(classification.category) : undefined,
      waterClass: classification?.class ? parseInt(classification.class) : undefined,
      suburb: suburb || "Unknown",
      state: "QLD",
      description: (inspectionAny.lossDescription as string | undefined) ?? `Water damage restoration job, ${totalAreaM2.toFixed(0)}m² affected`,
      jobName: `Inspection ${(inspection as Record<string, unknown>).inspectionNumber as string}`,
      totalExTax: 0,
      itemCount: 0,
      equipmentCount: 0,
    }

    const queryText = buildJobEmbeddingText(queryInput)

    // Embed the query (use hash-fallback if no OpenAI key)
    const provider: "openai" | "hash-fallback" = process.env.OPENAI_API_KEY ? "openai" : "hash-fallback"
    const apiKey = process.env.OPENAI_API_KEY ?? ""
    const queryVector = await embedText(queryText, provider, apiKey)

    // Search for similar jobs
    const results = await findSimilarJobs({
      queryVector,
      tenantId: session.user.id,
      claimType: claimTypeFilter,
      limit,
    })

    return NextResponse.json({
      results,
      count: results.length,
      queryType: classification ? "inspection" : "generic",
      provider,
    })
  } catch (error) {
    console.error("[similar-jobs] Error:", error)
    return NextResponse.json(
      { error: "Failed to retrieve similar jobs" },
      { status: 500 }
    )
  }
}
