import { prisma } from "@/lib/prisma";
import { embedText, findSimilarJobs } from "@/lib/ai/embeddings";

export interface SimilarJob {
  id: string;
  claimType: string;
  waterCategory: number | null;
  waterClass: number | null;
  suburb: string;
  state: string;
  description: string;
  jobName: string;
  totalExTax: number;
  itemCount: number;
  equipmentCount: number;
  distance: number;
}

export interface RAGContext {
  similarJobs: SimilarJob[];
  contextPrompt: string;
  jobCount: number;
}

/**
 * Build a query text from the current inspection for similarity search.
 */
function buildQueryText(options: {
  claimType: string;
  waterCategory?: number;
  waterClass?: number;
  description: string;
  suburb?: string;
}): string {
  return [
    `Claim type: ${options.claimType}`,
    options.waterCategory
      ? `IICRC Category ${options.waterCategory} Class ${options.waterClass ?? "unknown"}`
      : "",
    options.suburb ? `Location: ${options.suburb}` : "",
    options.description,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format similar jobs into an AI-readable context block.
 */
function formatContextPrompt(jobs: SimilarJob[]): string {
  if (jobs.length === 0) return "";
  return [
    "## Similar Historical Jobs (use as reference only — do not copy verbatim)",
    "",
    ...jobs.map(
      (job, i) =>
        `### Reference Job ${i + 1}\n` +
        `- Type: ${job.claimType}` +
        (job.waterCategory
          ? ` Cat ${job.waterCategory} Class ${job.waterClass ?? "?"}`
          : "") +
        `\n- Location: ${job.suburb}, ${job.state}` +
        `\n- Job: ${job.jobName}` +
        `\n- Items: ${job.itemCount}, Equipment: ${job.equipmentCount}` +
        `\n- Value: $${job.totalExTax.toFixed(2)} ex-tax` +
        `\n- Description: ${job.description.slice(0, 300)}${
          job.description.length > 300 ? "..." : ""
        }`,
    ),
    "",
    "Use these completed jobs as context for realistic scope, equipment quantities, and timelines.",
  ].join("\n");
}

/**
 * Retrieve similar jobs using a simple text-match fallback (no pgvector required).
 * This works before the vector store is populated.
 */
async function retrieveSimilarJobsTextFallback(options: {
  tenantId: string;
  claimType: string;
  limit: number;
}): Promise<SimilarJob[]> {
  // Use the HistoricalJob table if it exists, with a simple claimType filter
  try {
    const jobs = await (prisma as any).historicalJob.findMany({
      where: {
        tenantId: options.tenantId,
        claimType: options.claimType,
      },
      take: options.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        claimType: true,
        waterCategory: true,
        waterClass: true,
        suburb: true,
        state: true,
        description: true,
        jobName: true,
        totalExTax: true,
        itemCount: true,
        equipmentCount: true,
      },
    });
    return jobs.map((j: any) => ({ ...j, distance: 1.0 }));
  } catch {
    return [];
  }
}

/**
 * Main RAG retrieval function.
 * Tries pgvector first, falls back to text-match, then returns empty context.
 */
export async function retrieveSimilarJobs(options: {
  tenantId: string;
  claimType: string;
  waterCategory?: number;
  waterClass?: number;
  description: string;
  suburb?: string;
  limit?: number;
}): Promise<RAGContext> {
  const { tenantId, claimType, limit = 5 } = options;

  let similar: SimilarJob[] = [];

  // Try pgvector similarity search if vectors exist
  try {
    const queryText = buildQueryText(options);
    const provider = (
      process.env.OPENAI_API_KEY ? "openai" : "hash-fallback"
    ) as "openai" | "hash-fallback";
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    const queryVector = await embedText(queryText, provider, apiKey);
    similar = await findSimilarJobs({
      queryVector,
      tenantId,
      claimType,
      limit,
    });
  } catch {
    // pgvector not ready — try text fallback
    similar = await retrieveSimilarJobsTextFallback({
      tenantId,
      claimType,
      limit,
    });
  }

  return {
    similarJobs: similar,
    contextPrompt: formatContextPrompt(similar),
    jobCount: similar.length,
  };
}

/**
 * Safe wrapper — NEVER throws. Report generation always continues even if RAG fails.
 */
export async function safeRetrieveSimilarJobs(
  options: Parameters<typeof retrieveSimilarJobs>[0],
): Promise<RAGContext> {
  try {
    return await retrieveSimilarJobs(options);
  } catch (err) {
    console.warn(
      "[RAG] Failed to retrieve similar jobs, continuing without context:",
      err,
    );
    return { similarJobs: [], contextPrompt: "", jobCount: 0 };
  }
}
