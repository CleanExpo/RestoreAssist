/**
 * RA-1132d: StandardsChunk RAG ingestion script.
 *
 * Loads in-house authored clause summaries from scripts/data/standards-corpus.json,
 * generates embeddings via OpenAI text-embedding-3-small (1536 dims), and upserts
 * each row to the StandardsChunk table using raw SQL (required because the
 * `embedding vector(1536)` column is Prisma Unsupported type).
 *
 * LICENSING NOTE: The corpus contains in-house authored summaries of clause
 * topic areas — NOT verbatim IICRC or standards text. Full clause ingestion
 * is blocked pending legal clearance (RA-1132 licensing stream).
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... DATABASE_URL=postgres://... npx tsx scripts/ingest-standards.ts
 *
 * Cost estimate (2025 pricing):
 *   25 entries × ~150 tokens = 3,750 tokens × $0.02/M ≈ $0.00008 USD
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorpusEntry {
  standard: string;
  edition: string;
  clause: string;
  title: string;
  jurisdiction: string;
  summary: string;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

// ─── OpenAI embedding provider via native fetch ───────────────────────────────

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model = "text-embedding-3-small";

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI embeddings API error ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data[0].embedding;
  }
}

// ─── Corpus loader ────────────────────────────────────────────────────────────

export function loadCorpus(corpusPath: string): CorpusEntry[] {
  const raw = fs.readFileSync(corpusPath, "utf-8");
  const entries = JSON.parse(raw) as unknown[];

  if (!Array.isArray(entries)) {
    throw new Error("Corpus must be a JSON array");
  }

  return entries.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Corpus entry ${i} is not an object`);
    }
    const e = entry as Record<string, unknown>;
    const required = [
      "standard",
      "edition",
      "clause",
      "title",
      "jurisdiction",
      "summary",
    ];
    for (const field of required) {
      if (typeof e[field] !== "string" || (e[field] as string).trim() === "") {
        throw new Error(`Corpus entry ${i} missing required field: ${field}`);
      }
    }
    return {
      standard: e.standard as string,
      edition: e.edition as string,
      clause: e.clause as string,
      title: e.title as string,
      jurisdiction: e.jurisdiction as string,
      summary: e.summary as string,
    };
  });
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Formats a float32 array as a pgvector literal: [0.123,0.456,...]
 */
export function formatPgvector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function upsertChunk(
  prisma: PrismaClient,
  entry: CorpusEntry,
  embedding: number[],
): Promise<void> {
  const id = randomUUID();
  const text = `${entry.title}\n\n${entry.summary}`;
  const embeddingLiteral = formatPgvector(embedding);

  await prisma.$executeRaw`
    INSERT INTO "StandardsChunk" (id, standard, edition, clause, title, text, jurisdiction, embedding)
    VALUES (
      ${id},
      ${entry.standard},
      ${entry.edition},
      ${entry.clause},
      ${entry.title},
      ${text},
      ${entry.jurisdiction},
      ${embeddingLiteral}::vector
    )
    ON CONFLICT (standard, edition, clause) DO UPDATE SET
      title      = EXCLUDED.title,
      text       = EXCLUDED.text,
      embedding  = EXCLUDED.embedding
  `;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const corpusPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "data/standards-corpus.json",
  );

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const prisma = new PrismaClient();
  const provider = new OpenAIEmbeddingProvider(apiKey);

  console.log(`Loading corpus from: ${corpusPath}`);
  const entries = loadCorpus(corpusPath);
  console.log(`Loaded ${entries.length} entries`);

  let succeeded = 0;
  let failed = 0;
  const totalTokenEstimate = entries.length * 150;

  for (const [i, entry] of entries.entries()) {
    const text = `${entry.title}\n\n${entry.summary}`;
    try {
      process.stdout.write(
        `[${i + 1}/${entries.length}] Embedding ${entry.standard} §${entry.clause} ... `,
      );
      const embedding = await provider.embed(text);
      await upsertChunk(prisma, entry, embedding);
      console.log("ok");
      succeeded++;
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
      failed++;
    }
  }

  await prisma.$disconnect();

  const costUsd = (totalTokenEstimate / 1_000_000) * 0.02;
  console.log(
    `\nDone: ${succeeded} upserted, ${failed} failed.\n` +
      `Estimated embedding cost: ~${entries.length} entries × ~150 tokens = ` +
      `${totalTokenEstimate.toLocaleString()} tokens ≈ $${costUsd.toFixed(6)} USD`,
  );

  if (failed > 0) process.exit(1);
}

// Run only when executed directly (not imported in tests)
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
