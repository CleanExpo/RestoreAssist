/**
 * lib/ai/embeddings.ts
 *
 * Embedding utilities for the Ascora AI learning model (RA-276 / RA-277).
 *
 * - buildJobEmbeddingText: converts a HistoricalJob row into a rich text
 *   representation suitable for semantic embedding.
 * - embedText: calls a real embedding API (OpenAI text-embedding-3-small).
 * - hashEmbedText: deterministic 1536-dim fallback when no API key is present.
 * - findSimilarJobs: cosine-similarity lookup against pgvector index.
 */

import { prisma } from "@/lib/prisma"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobEmbeddingInput {
  claimType: string
  waterCategory?: number | null
  waterClass?: number | null
  suburb: string
  state: string
  description: string
  jobName: string
  customerName?: string | null
  totalExTax: number
  itemCount: number
  equipmentCount: number
  customFields?: unknown
}

export type EmbeddingProvider = "openai" | "hash-fallback"

// ─── Text builder ─────────────────────────────────────────────────────────────

/**
 * Builds a plain-text representation of a historical job for embedding.
 * Designed to surface the semantically meaningful parts: claim type, IICRC
 * classification, location, scope narrative, and value tier.
 */
export function buildJobEmbeddingText(job: JobEmbeddingInput): string {
  const lines: string[] = [
    `Claim type: ${job.claimType}`,
  ]

  if (job.waterCategory != null && job.waterClass != null) {
    lines.push(`IICRC Category ${job.waterCategory} Class ${job.waterClass}`)
  } else if (job.waterCategory != null) {
    lines.push(`IICRC Category ${job.waterCategory}`)
  }

  lines.push(`Location: ${job.suburb}, ${job.state}`)
  lines.push(`Job: ${job.jobName}`)

  if (job.description?.trim()) {
    lines.push(job.description.trim())
  }

  lines.push(`Items: ${job.itemCount}, Equipment: ${job.equipmentCount}`)
  lines.push(`Value: $${job.totalExTax.toFixed(2)} ex-tax`)

  if (job.customerName) {
    lines.push(`Customer: ${job.customerName}`)
  }

  if (job.customFields) {
    lines.push(`Custom fields: ${JSON.stringify(job.customFields)}`)
  }

  return lines.filter(Boolean).join("\n")
}

// ─── Embedding providers ──────────────────────────────────────────────────────

/**
 * Calls OpenAI text-embedding-3-small (1536 dims).
 * Returns a normalised float array.
 */
export async function embedText(
  text: string,
  provider: EmbeddingProvider,
  apiKey: string
): Promise<number[]> {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI embedding error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    return data.data[0].embedding as number[]
  }

  if (provider === "hash-fallback") {
    return hashEmbedText(text)
  }

  throw new Error(`Unsupported embedding provider: ${provider}`)
}

/**
 * Deterministic 1536-dim vector from plain text — no API key required.
 * Uses a signed-sine hash so adjacent chars produce varied, stable floats.
 * Produces a unit-normalised vector so cosine similarity still works.
 *
 * This is a structural placeholder: the pgvector infrastructure is fully
 * functional end-to-end, and real OpenAI embeddings can be swapped in by
 * changing provider to "openai" once an API key is available.
 */
export function hashEmbedText(text: string): number[] {
  const dims = 1536
  const vector = new Array<number>(dims).fill(0)

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    // Spread character influence across multiple dimensions
    const primary = i % dims
    const secondary = (i * 31 + charCode) % dims
    const tertiary = (i * 137 + charCode * 7) % dims

    vector[primary] = (vector[primary] + charCode * Math.sin(i + 1)) % 1
    vector[secondary] = (vector[secondary] + charCode * Math.cos(i + 1)) % 1
    vector[tertiary] = (vector[tertiary] + Math.sin(charCode * (i + 1))) % 1
  }

  // L2-normalise to unit vector so cosine similarity is meaningful
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  return magnitude > 0 ? vector.map((v) => v / magnitude) : vector
}

// ─── Similarity search ────────────────────────────────────────────────────────

export interface SimilarJobResult {
  id: string
  claimType: string
  waterCategory: number | null
  waterClass: number | null
  suburb: string
  state: string
  description: string
  jobName: string
  totalExTax: number
  itemCount: number
  equipmentCount: number
  distance: number
}

/**
 * Returns the N most similar HistoricalJobs to the query vector using
 * pgvector cosine distance (<=>).  Filtered by tenantId and optionally
 * by claimType.
 *
 * Requires the HNSW index created by migration
 * 20260330_add_pgvector_historical_job_embeddings.
 */
export async function findSimilarJobs(options: {
  queryVector: number[]
  tenantId: string
  claimType?: string
  limit?: number
}): Promise<SimilarJobResult[]> {
  const { queryVector, tenantId, claimType, limit = 5 } = options

  // Serialize vector as pgvector literal e.g. "[0.1,0.2,...]"
  const vectorStr = `[${queryVector.join(",")}]`

  const claimTypeFilter = claimType ? `AND "claimType" = '${claimType.replace(/'/g, "''")}'` : ""

  const rows = await prisma.$queryRawUnsafe<SimilarJobResult[]>(
    `
    SELECT
      id,
      "claimType",
      "waterCategory",
      "waterClass",
      suburb,
      state,
      description,
      "jobName",
      "totalExTax",
      "itemCount",
      "equipmentCount",
      "embeddingVector" <=> '${vectorStr}'::vector AS distance
    FROM "HistoricalJob"
    WHERE "tenantId" = $1
      AND "embeddedAt" IS NOT NULL
      ${claimTypeFilter}
    ORDER BY distance ASC
    LIMIT $2
    `,
    tenantId,
    limit
  )

  return rows
}
