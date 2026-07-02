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
 *     provider?: "openai" | "hash-fallback"   // default: "openai" if the workspace has an
 *                                              //          active OpenAI BYOK key, else "hash-fallback"
 *     openaiApiKey?: string                    // explicit override, bypasses BYOK resolution
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
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildJobEmbeddingText,
  embedText,
  type EmbeddingProvider,
} from "@/lib/ai/embeddings";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";

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

export async function POST(
  request: NextRequest,
  { params: _params }: RouteParams,
) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body: VectoriseBody = await request.json().catch(() => ({}));

    // RA-6921 (P0) — resolve the workspace's own OpenAI key rather than the
    // platform env var; degrade to hash-fallback when the workspace has none.
    // An explicit body.openaiApiKey override remains supported.
    let openaiApiKey = body.openaiApiKey;
    if (!openaiApiKey) {
      try {
        const workspaceKey = await resolveWorkspaceAiKey(
          session.user.id,
          "OPENAI",
        );
        openaiApiKey = workspaceKey.apiKey;
      } catch {
        // No workspace key configured — fall through to hash-fallback below.
      }
    }
    const provider: EmbeddingProvider =
      body.provider ?? (openaiApiKey ? "openai" : "hash-fallback");

    // Validate provider/key combo
    if (provider === "openai" && !openaiApiKey) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "provider=openai requires a workspace OpenAI key (Workspace Settings -> AI Providers) or an explicit openaiApiKey in body",
        status: 400,
      });
    }

    const batchSize = Math.min(body.batchSize ?? 50, 200);

    // tenantId is always the authenticated user's own ID.
    // Admin override via body.tenantId was removed — it allowed any user to read
    // and overwrite another user's HistoricalJob embeddings by supplying a foreign userId.
    const tenantId = session.user.id;

    // ── Count total jobs (cheap) and fetch only un-embedded rows ─────────────
    const [{ count: totalCount }] = await prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "HistoricalJob" WHERE "tenantId" = ${tenantId}`,
    );
    const total = Number(totalCount);

    // MAX_EMBED_PER_RUN caps one invocation to 1 000 rows — prevents Vercel timeout
    const MAX_EMBED_PER_RUN = 1000;
    const unembedded = await prisma.$queryRaw<HistoricalJobRow[]>(
      Prisma.sql`
      SELECT
        id, "tenantId", "claimType", "waterCategory", "waterClass",
        suburb, state, description, "jobName", "customerName",
        "totalExTax", "itemCount", "equipmentCount", "customFields",
        "embeddedAt"
      FROM "HistoricalJob"
      WHERE "tenantId" = ${tenantId}
        AND "embeddedAt" IS NULL
      ORDER BY "createdAt" ASC
      LIMIT ${MAX_EMBED_PER_RUN}
      `,
    );

    const skipped = total - unembedded.length;

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

            await prisma.$executeRaw(
              Prisma.sql`
              UPDATE "HistoricalJob"
              SET
                "embeddingVector" = ${vectorStr}::vector,
                "embeddingModel"  = ${modelName},
                "embeddedAt"      = NOW()
              WHERE id = ${job.id}
              `,
            );

            embedded++;
          } catch (err) {
            const msg = `Job ${job.id} (${job.jobName ?? "unnamed"}): ${(err as Error).message}`;
            console.error(`[vectorise-jobs] ${msg}`);
            errors.push(msg);
          }
        }),
      );
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      embedded,
      skipped,
      total,
      errors,
      provider,
      durationMs,
    });
  } catch (err) {
    return fromException(request, err, { stage: "inspection-vectorise-jobs" });
  }
}
