/**
 * POST /api/admin/vectorise
 *
 * Admin endpoint to trigger batch vectorisation of all un-embedded HistoricalJob
 * rows for the authenticated user's tenant. Wraps the same logic used in
 * /api/inspections/[id]/vectorise-jobs without needing an inspection ID.
 *
 * Body:
 *   provider?: "openai" | "hash-fallback"  (default: openai if key present)
 *   batchSize?: number                      (default 50, max 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { embedText, buildJobEmbeddingText } from "@/lib/ai/embeddings";
import { withIdempotency } from "@/lib/idempotency";

interface HistoricalJobRow {
  id: string;
  tenantId: string;
  claimType: string | null;
  waterCategory: string | null;
  waterClass: string | null;
  suburb: string | null;
  state: string | null;
  description: string | null;
  jobName: string | null;
  customerName: string | null;
  totalExTax: number | null;
  itemCount: number | null;
  equipmentCount: number | null;
  customFields: string | null;
  embeddedAt: Date | null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const user = auth.user!;
  const userId = user.id;

  // RA-1266: batch vectorise burns OpenAI embedding calls — retry doubles spend.
  return withIdempotency(request, userId, async (rawBody) => {
    const startMs = Date.now();

    let body: { provider?: string; batchSize?: number } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      // no body is fine — use defaults
    }

    const provider = (body.provider ??
      (process.env.OPENAI_API_KEY ? "openai" : "hash-fallback")) as
      | "openai"
      | "hash-fallback";
    const batchSize = Math.min(body.batchSize ?? 50, 200);
    const tenantId = user.id;

    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "provider=openai requires OPENAI_API_KEY to be set" },
        { status: 400 },
      );
    }

    // Fetch all jobs for this tenant, unembedded first
    const allJobs = await prisma.$queryRawUnsafe<HistoricalJobRow[]>(
      `
    SELECT id, "tenantId", "claimType", "waterCategory", "waterClass",
           suburb, state, description, "jobName", "customerName",
           "totalExTax", "itemCount", "equipmentCount", "customFields",
           "embeddedAt"
    FROM "HistoricalJob"
    WHERE "tenantId" = $1
    ORDER BY "createdAt" ASC
    `,
      tenantId,
    );

    const total = allJobs.length;
    const toEmbed = allJobs
      .filter((j) => j.embeddedAt === null)
      .slice(0, batchSize);
    const skipped = total - toEmbed.length;

    if (toEmbed.length === 0) {
      return NextResponse.json({
        embedded: 0,
        skipped,
        total,
        remaining: 0,
        errors: [],
        provider,
        durationMs: Date.now() - startMs,
        message: "All jobs already embedded.",
      });
    }

    const errors: string[] = [];
    let embeddedCount = 0;

    for (const job of toEmbed) {
      try {
        const text = buildJobEmbeddingText({
          claimType: job.claimType ?? "water",
          waterCategory:
            job.waterCategory !== null ? Number(job.waterCategory) : undefined,
          waterClass:
            job.waterClass !== null ? Number(job.waterClass) : undefined,
          suburb: job.suburb ?? "Unknown",
          state: job.state ?? "QLD",
          description:
            job.description ?? `${job.claimType ?? "water"} restoration job`,
          jobName: job.jobName ?? `Job ${job.id}`,
          customerName: job.customerName ?? undefined,
          totalExTax: job.totalExTax ?? 0,
          itemCount: job.itemCount ?? 0,
          equipmentCount: job.equipmentCount ?? 0,
        });

        const apiKey = process.env.OPENAI_API_KEY ?? "";
        const vector = await embedText(text, provider, apiKey);
        const vectorLiteral = `[${vector.join(",")}]`;

        await prisma.$executeRawUnsafe(
          `UPDATE "HistoricalJob"
         SET embedding = $1::vector, "embeddedAt" = NOW()
         WHERE id = $2`,
          vectorLiteral,
          job.id,
        );
        embeddedCount++;
      } catch (err) {
        errors.push(
          `${job.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return NextResponse.json({
      embedded: embeddedCount,
      skipped,
      total,
      remaining: total - skipped - embeddedCount,
      errors,
      provider,
      durationMs: Date.now() - startMs,
      batchSize,
    });
  });
}
