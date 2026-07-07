/**
 * RA-6934 / RA-7000: server-side standards RAG ingest.
 *
 * The prod DATABASE_URL and OPENAI_API_KEY are Vercel-sensitive — they decrypt
 * ONLY inside the Vercel runtime and can never be pulled to an operator
 * machine. This route therefore runs the chunk → embed → upsert pipeline
 * server-side; the operator POSTs pre-extracted plain text per standard
 * (driver: scripts/ingest-standards-remote.ts). Verbatim standard text is
 * never stored in the repo — it passes through the request body only.
 *
 * Lives under /api/cron/ — the repo's bearer-token machine-route namespace —
 * but is operator-invoked, not scheduled (no vercel.json entry).
 * Auth: `Authorization: Bearer ${STANDARDS_INGEST_TOKEN}` — a dedicated
 * secret, fail-closed exactly like lib/cron/auth (RA-6679 pattern). Not
 * CRON_SECRET: this route mutates the RAG corpus and gets its own key so it
 * can be rotated/revoked independently of the cron fleet.
 *
 * Pipeline parity: imports the same pure functions the local script uses
 * (scripts/ingest-iicrc.ts), so chunk boundaries, content hashes, section
 * extraction, and upsert semantics are identical — a remote ingest and a
 * local ingest of the same text are idempotent with each other.
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  chunkText,
  extractSection,
  buildContentHash,
  upsertChunk,
  assertEmbeddingShape,
  parseProvenance,
} from "@/scripts/ingest-iicrc";
// Type-only import: erased at compile time, so it does NOT eagerly load
// lib/rag/retrieve (which constructs an OpenAI client at module load).
import type { ChunkResult } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  standard: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/),
  edition: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9.-]+$/),
  provenance: z
    .enum(["authoritative-standard", "knowledge"])
    .default("authoritative-standard"),
  jurisdiction: z.string().min(2).max(5).default("AU"),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        text: z.string().min(1).max(1_500_000),
      }),
    )
    .min(1)
    .max(50),
});

function verifyIngestAuth(request: NextRequest): NextResponse | null {
  // Fail CLOSED when the secret is unset/empty (RA-6679).
  const secret = process.env.STANDARDS_INGEST_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authError = verifyIngestAuth(request);
  if (authError) return authError;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { standard, edition, jurisdiction, files } = body;
  const provenance = parseProvenance(body.provenance);

  // Dynamic import — lib/rag/embed constructs its OpenAI client at module
  // load, which would break the CI build (no OPENAI_API_KEY there). Same
  // reason scripts/ingest-iicrc.ts imports it dynamically.
  const { embedBatch } = await import("@/lib/rag/embed");

  const summary = {
    standard,
    edition,
    filesProcessed: 0,
    chunksUpserted: 0,
    chunksSkipped: 0,
  };
  const BATCH = 100;

  try {
    for (const file of files) {
      const chunks = chunkText(file.text);
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const embeddings = await embedBatch(batch);
        assertEmbeddingShape(embeddings, batch.length);

        for (let j = 0; j < batch.length; j++) {
          const content = batch[j];
          const result = await upsertChunk(prisma, {
            standard,
            edition,
            ...extractSection(content),
            content,
            contentHash: buildContentHash(standard, edition, content),
            pageNumber: Math.floor((i + j) / 2) + 1,
            embedding: embeddings[j],
            provenance,
            jurisdiction,
          });
          if (result === "inserted") summary.chunksUpserted++;
          else summary.chunksSkipped++;
        }
      }
      summary.filesProcessed++;
    }
  } catch (err) {
    // RA-786: no error.message in responses; log server-side with progress
    // context so a partial ingest is diagnosable and safely re-runnable
    // (upserts are idempotent by contentHash).
    console.error("[ingest-standards] failed mid-ingest:", summary, err);
    return NextResponse.json(
      { error: "Internal server error", partial: summary },
      { status: 500 },
    );
  }

  return NextResponse.json(summary);
}

/**
 * RA-6934: read-only RAG health probe. Returns chunk counts grouped by
 * provenance tier + source kind so an operator (or a monitor) can confirm the
 * corpus is populated and correctly tiered without needing the sensitive
 * DATABASE_URL. Same fail-closed bearer auth as the ingest POST. Closes the
 * "a silently-empty or mis-tagged RAG has no signal" gap flagged in
 * docs/runbooks/ra-6934-iicrc-rag-populate.md.
 *
 * RA-7000: with `?q=<query>`, also runs the EXACT retrieval the report
 * generator uses — retrieveForCitation (authoritative tier only) and
 * retrieveForReasoning (all tiers) — so an operator can confirm grounding
 * works end-to-end on live data. Snippets are truncated; verbatim standard
 * text is never reproduced through this path.
 */
function sampleChunk(r: ChunkResult) {
  return {
    standard: r.standard,
    edition: r.edition,
    section: r.section,
    provenance: r.provenance,
    jurisdiction: r.jurisdiction,
    similarity: Math.round(r.similarity * 1000) / 1000,
    snippet: r.content.slice(0, 120),
  };
}

export async function GET(request: NextRequest) {
  const authError = verifyIngestAuth(request);
  if (authError) return authError;

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 300);

  try {
    const byTier = await prisma.$queryRaw<
      { kind: string; provenance: string; chunks: number }[]
    >`
      SELECT
        CASE
          WHEN standard LIKE 'S%' OR standard LIKE 'RIA%' THEN 'standard'
          ELSE 'knowledge'
        END AS kind,
        provenance::text AS provenance,
        count(*)::int AS chunks
      FROM "IicrcChunk"
      GROUP BY 1, 2
      ORDER BY 1, 2`;

    const total = byTier.reduce((sum, row) => sum + row.chunks, 0);

    if (!query) return NextResponse.json({ total, byTier });

    // Dynamic import — lib/rag/retrieve builds an OpenAI client at module load.
    const { retrieveForCitation, retrieveForReasoning } = await import(
      "@/lib/rag/retrieve"
    );
    const [citation, reasoning] = await Promise.all([
      retrieveForCitation(query, { k: 3 }),
      retrieveForReasoning(query, { k: 3 }),
    ]);

    return NextResponse.json({
      total,
      byTier,
      probe: {
        query,
        citation: citation.map(sampleChunk),
        reasoning: reasoning.map(sampleChunk),
      },
    });
  } catch (err) {
    // RA-786: no error.message in responses; log server-side.
    console.error("[ingest-standards] health probe failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
