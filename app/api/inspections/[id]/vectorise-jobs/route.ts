/**
 * POST /api/inspections/[id]/vectorise-jobs
 *
 * Embedding worker — vectorises all un-embedded HistoricalJob rows for
 * the authenticated user's tenant.
 *
 * This powers the Ascora AI learning model (RA-277): once jobs are
 * vectorised, /api/inspections/[id]/similar-jobs can return semantically
 * similar historical jobs for scope pre-filling and pricing guidance.
 *
 * Body (all optional):
 *   {
 *     provider?: "openai" | "hash-fallback"   // default: "openai" if OPENAI_API_KEY set,
 *                                              //          else "hash-fallback"
 *     openaiApiKey?: string                    // override env var at runtime
 *     batchSize?: number                       // rows per batch (default 50)
 *     tenantId?: string                        // admin override; defaults to session user's tenantId
 *   }
 *
 * Response:
 *   {
 *     embedded: number      // rows newly embedded this run
 *     skipped: number       // rows already had embeddedAt set
 *     total: number         // total HistoricalJob rows for this tenant
 *     errors: string[]      // per-row error messages (job continues on error)
 *     provider: string      // which embedding provider was used
 *     durationMs: number
 *   }
 *
 * Notes:
 * - Idempotent: rows with embeddedAt set are skipped.
 * - On error, the row is logged and processing continues.
 * - Uses raw SQL UPDATE to write the vector(1536) column managed outside Prisma.
 * - "hash-fallback" provider generates a deterministic 1536-dim unit vector
 *   with no API key — useful for testing the full pipeline end-to-end.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildJobEmbeddingText,
  embedText,
  type EmbeddingProvider,
} from "@/lib/ai/embeddings";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface VectoriseBody {
  provider?: EmbeddingProvider;
  openaiApiKey?: string;
  batchSize?: number;
  tenantId?: string;
}

interface HistoricalJobRow {
  id: string;
  tenantId: string;
  claimType: string;
  waterCategory: number | null;
  waterClass: number | null;
  suburb: string;
  state: string;
  description: string;
  jobName: string;
  customerName: string | null;
  totalExTax: number;
  itemCount: number;
  equipmentCount: number;
  customFields: unknown;
  embeddedAt: Date | null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: VectoriseBody = await request.json().catch(() => ({}));

    // Resolve embedding provider
    const openaiApiKey = body.openaiApiKey ?? process.env.OPENAI_API_KEY;
    const provider: EmbeddingProvider =
      body.provider ?? (openaiApiKey ? "openai" : "hash-fallback");

    // Validate provider/key combo
    if (provider === "openai" && !openaiApiKey) {
      return NextResponse.json(
        {
          error:
            "provider=openai requires OPENAI_API_KEY env var or openaiApiKey in body",
        },
        { status: 400 },
      );
    }

    const batchSize = Math.min(body.batchSize ?? 50, 200);

    // tenantId is always the authenticated user's own ID.
    // Admin override via body.tenantId was removed — it allowed any user to read
    // and overwrite another user's HistoricalJob embeddings by supplying a foreign userId.
    const tenantId = session.user.id;

    // ── Count total jobs (cheap) and fetch only un-embedded rows ─────────────
    const [{ count: totalCount }] = await prisma.$queryRawUnsafe<
      [{ count: bigint }]
    >(
      `SELECT COUNT(*) AS count FROM "HistoricalJob" WHERE "tenantId" = $1`,
      tenantId,
    );
    const total = Number(totalCount);

    // MAX_EMBED_PER_RUN caps one invocation to 1 000 rows — prevents Vercel timeout
    const MAX_EMBED_PER_RUN = 1000;
    const unembedded = await prisma.$queryRawUnsafe<HistoricalJobRow[]>(
      `
      SELECT
        id, "tenantId", "claimType", "waterCategory", "waterClass",
        suburb, state, description, "jobName", "customerName",
        "totalExTax", "itemCount", "equipmentCount", "customFields",
        "embeddedAt"
      FROM "HistoricalJob"
      WHERE "tenantId" = $1
        AND "embeddedAt" IS NULL
      ORDER BY "createdAt" ASC
      LIMIT $2
      `,
      tenantId,
      MAX_EMBED_PER_RUN,
    );

    const skipped = total - unembedded.length;

    console.log(
      `[vectorise-jobs] tenant=${tenantId} total=${total} to-embed=${unembedded.length} provider=${provider}`,
    );

    if (unembedded.length === 0) {
      return NextResponse.json({
        embedded: 0,
        skipped,
        total,
        errors: [],
        provider,
        durationMs: Date.now() - startTime,
        message: "All jobs already embedded — nothing to do.",
      });
    }

    // ── Process in batches ───────────────────────────────────────────────────
    let embedded = 0;
    const errors: string[] = [];

    for (let i = 0; i < unembedded.length; i += batchSize) {
      const batch = unembedded.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (job) => {
          try {
            // 1. Build embedding text
            const text = buildJobEmbeddingText({
              claimType: job.claimType,
              waterCategory: job.waterCategory,
              waterClass: job.waterClass,
              suburb: job.suburb ?? "",
              state: job.state ?? "",
              description: job.description ?? "",
              jobName: job.jobName ?? "",
              customerName: job.customerName,
              totalExTax: job.totalExTax ?? 0,
              itemCount: job.itemCount ?? 0,
              equipmentCount: job.equipmentCount ?? 0,
              customFields: job.customFields,
            });

            // 2. Generate vector
            const vector = await embedText(text, provider, openaiApiKey ?? "");

            // 3. Persist via raw SQL — Prisma doesn't natively support vector(1536)
            const vectorStr = `[${vector.join(",")}]`;
            const modelName =
              provider === "openai"
                ? "text-embedding-3-small"
                : "hash-fallback-v1";

            await prisma.$executeRawUnsafe(
              `
              UPDATE "HistoricalJob"
              SET
                "embeddingVector" = $1::vector,
                "embeddingModel"  = $2,
                "embeddedAt"      = NOW()
              WHERE id = $3
              `,
              vectorStr,
              modelName,
              job.id,
            );

            embedded++;
          } catch (err) {
            const msg = `Job ${job.id} (${job.jobName ?? "unnamed"}): ${(err as Error).message}`;
            console.error(`[vectorise-jobs] ${msg}`);
            errors.push(msg);
          }
        }),
      );

      console.log(
        `[vectorise-jobs] batch ${Math.floor(i / batchSize) + 1} done — ` +
          `embedded so far: ${embedded}/${unembedded.length}`,
      );
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[vectorise-jobs] complete — embedded=${embedded} skipped=${skipped} errors=${errors.length} duration=${durationMs}ms`,
    );

    return NextResponse.json({
      embedded,
      skipped,
      total,
      errors,
      provider,
      durationMs,
    });
  } catch (err) {
    console.error("[vectorise-jobs] Unexpected error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
