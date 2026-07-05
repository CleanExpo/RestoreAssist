/**
 * RA-434 / RA-6934: IICRC PDF ingestion script — chunks PDFs and stores pgvector embeddings.
 *
 * Usage:
 *   npx tsx scripts/ingest-iicrc.ts --dir ./iicrc-pdfs --standard S500 --edition 2025
 *
 * Pre-extract PDF text first:
 *   pdftotext IICRC_S500_2025.pdf IICRC_S500_2025.txt
 *
 * Idempotent — upserts by a (standard, edition, content) hash. Safe to re-run:
 * chunks already present are skipped, not duplicated or re-embedded.
 *
 * Fails loud, before doing any work, if OPENAI_API_KEY or DATABASE_URL is
 * missing — never partially embeds a batch and exits 0. See docs/runbooks/
 * for the founder-facing populate procedure (RA-6934).
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";

export const CHUNK_SIZE = 500;
export const CHUNK_OVERLAP = 100;
export const MIN_CHUNK_LENGTH = 20;

// Must match lib/rag/embed.ts EMBEDDING_DIMENSIONS and the IicrcChunk.embedding
// `vector(1536)` column (prisma/schema.prisma). Duplicated here (not imported)
// because lib/rag/embed.ts constructs its OpenAI client at module load — a
// static import would do that before validateIngestEnv() gets a chance to
// fail with a clear message.
export const EXPECTED_EMBEDDING_DIMENSIONS = 1536;

export interface IngestArgs {
  dir: string;
  standard: string;
  edition: string;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): IngestArgs {
  const get = (flag: string, def: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : def;
  };
  return {
    dir: get("--dir", "./iicrc-pdfs"),
    standard: get("--standard", "S500"),
    edition: get("--edition", "2025"),
  };
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > MIN_CHUNK_LENGTH);
}

export function extractSection(chunk: string): {
  section: string;
  heading: string;
} {
  const match = chunk.match(/§\s*[\d.]+[a-z]?/i);
  const headingMatch = chunk.match(/^([A-Z][A-Za-z\s]{5,60})$/m);
  return {
    section: match?.[0]?.replace(/\s+/g, "") ?? "General",
    heading: headingMatch?.[1]?.trim() ?? chunk.slice(0, 60).trim(),
  };
}

/**
 * Scopes the dedup hash to (standard, edition, content) rather than content
 * alone. Two different standards can legitimately share identical boilerplate
 * text (cover pages, copyright notices); hashing content alone would collide
 * and silently drop the second document's chunk under IicrcChunk.contentHash's
 * global unique constraint, and any row that did land would carry the wrong
 * `standard`/`edition` for one of the two documents.
 */
export function buildContentHash(
  standard: string,
  edition: string,
  content: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${standard}:${edition}:${content}`)
    .digest("hex");
}

/**
 * Fails loud, before any file I/O or DB/API calls, if a required env var is
 * missing or blank. Throws (caller decides how to surface/exit) rather than
 * letting the run start and fail partway through a batch.
 */
export function validateIngestEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  if (!env.OPENAI_API_KEY?.trim()) missing.push("OPENAI_API_KEY");
  if (!env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them (Vercel: Project Settings -> Environment Variables -> Production, ` +
        `or .env.local for a local run against a non-prod DB) before re-running. ` +
        `See docs/runbooks/ra-6934-iicrc-rag-populate.md.`,
    );
  }
}

/**
 * Refuses to insert a batch of embeddings that doesn't line up with what was
 * asked for — a provider bug that returns the wrong count or dimension would
 * otherwise either silently misalign chunk<->vector pairs or fail deep inside
 * a Postgres pgvector cast with a cryptic error.
 */
export function assertEmbeddingShape(
  embeddings: number[][],
  expectedCount: number,
): void {
  if (embeddings.length !== expectedCount) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for a batch of ` +
        `${expectedCount} texts — refusing to insert misaligned rows.`,
    );
  }
  embeddings.forEach((vec, i) => {
    if (vec.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding ${i} has ${vec.length} dimensions, expected ` +
          `${EXPECTED_EMBEDDING_DIMENSIONS} (IicrcChunk.embedding is vector(${EXPECTED_EMBEDDING_DIMENSIONS})).`,
      );
    }
  });
}

export interface ChunkRow {
  standard: string;
  edition: string;
  section: string;
  heading: string;
  content: string;
  contentHash: string;
  pageNumber: number;
  embedding: number[];
}

export interface IicrcChunkPrisma {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
}

/**
 * Upserts one chunk via a single atomic `INSERT ... ON CONFLICT DO NOTHING`.
 * $executeRawUnsafe resolves to the affected row count: 0 means the
 * contentHash already existed (skipped, not re-embedded), 1 means inserted.
 * A single statement — no separate findUnique pre-check — so there's no
 * check-then-insert race across concurrent runs.
 */
export async function upsertChunk(
  prisma: IicrcChunkPrisma,
  row: ChunkRow,
): Promise<"inserted" | "skipped"> {
  const vectorLiteral = `[${row.embedding.join(",")}]`;
  const affected = await prisma.$executeRawUnsafe(
    `INSERT INTO "IicrcChunk" (id, standard, edition, section, heading, content, "contentHash", "pageNumber", embedding, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8::vector, NOW(), NOW())
     ON CONFLICT ("contentHash") DO NOTHING`,
    row.standard,
    row.edition,
    row.section,
    row.heading,
    row.content,
    row.contentHash,
    row.pageNumber,
    vectorLiteral,
  );
  return affected === 0 ? "skipped" : "inserted";
}

async function embedBatchDynamic(texts: string[]): Promise<number[][]> {
  // Dynamic import to avoid requiring OPENAI_API_KEY at module load time —
  // validateIngestEnv() must be the thing that fails first, with a clear
  // message, not an OpenAI SDK construction error.
  const { embedBatch } = await import("../lib/rag/embed");
  return embedBatch(texts);
}

export interface IngestSummary {
  filesProcessed: number;
  chunksUpserted: number;
  chunksSkipped: number;
}

async function main() {
  validateIngestEnv();

  const { dir, standard, edition } = parseArgs();
  console.log(`Ingesting ${standard}:${edition} from ${dir}`);

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  // This script reads plain text only — it does not parse PDF binaries. A raw
  // .pdf left un-extracted would previously be read as "utf-8" text anyway,
  // silently ingesting garbage bytes as chunk content instead of failing.
  // Require pdftotext to have run first: fail loud and name the file.
  const allEntries = fs.readdirSync(dir);
  const txtFiles = allEntries.filter((f) => f.endsWith(".txt"));
  const unconvertedPdfs = allEntries.filter(
    (f) => f.endsWith(".pdf") && !txtFiles.includes(f.replace(/\.pdf$/, ".txt")),
  );

  if (unconvertedPdfs.length > 0) {
    console.error(
      `FATAL: found ${unconvertedPdfs.length} .pdf file(s) with no matching .txt extraction: ` +
        `${unconvertedPdfs.join(", ")}. Run 'pdftotext <file>.pdf <file>.txt' for each, then re-run.`,
    );
    process.exit(1);
  }

  if (txtFiles.length === 0) {
    console.log("No .txt files found. Extract text first with pdftotext.");
    process.exit(0);
  }

  const files = txtFiles;

  const prisma = new PrismaClient();
  const summary: IngestSummary = {
    filesProcessed: 0,
    chunksUpserted: 0,
    chunksSkipped: 0,
  };

  const BATCH = 100;

  for (const file of files) {
    const filePath = path.join(dir, file);
    console.log(`Processing: ${file}`);
    const text = fs.readFileSync(filePath, "utf-8");
    const chunks = chunkText(text);
    console.log(`  ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedBatchDynamic(batch);
      assertEmbeddingShape(embeddings, batch.length);

      for (let j = 0; j < batch.length; j++) {
        const content = batch[j];
        const contentHash = buildContentHash(standard, edition, content);
        const { section, heading } = extractSection(content);
        const pageNumber = Math.floor((i + j) / 2) + 1;

        const result = await upsertChunk(prisma, {
          standard,
          edition,
          section,
          heading,
          content,
          contentHash,
          pageNumber,
          embedding: embeddings[j],
        });

        if (result === "inserted") summary.chunksUpserted++;
        else summary.chunksSkipped++;
      }

      process.stdout.write(
        `  Progress: ${Math.min(i + BATCH, chunks.length)}/${chunks.length}\r`,
      );
    }
    console.log();
    summary.filesProcessed++;
  }

  await prisma.$disconnect();

  const totalChunks = summary.chunksUpserted + summary.chunksSkipped;
  console.log(
    `\nDone. Files processed: ${summary.filesProcessed}. ` +
      `Chunks embedded (new): ${summary.chunksUpserted}. ` +
      `Chunks skipped (already ingested): ${summary.chunksSkipped}. ` +
      `Total chunks seen: ${totalChunks}.`,
  );

  if (totalChunks === 0) {
    // Files existed and were read, but produced zero usable chunks — that's
    // a silent-empty-RAG outcome in the making. Fail loud rather than exit 0.
    console.error(
      `FATAL: ${summary.filesProcessed} file(s) were processed but produced ` +
        `zero chunks (all shorter than ${MIN_CHUNK_LENGTH} chars after chunking). ` +
        `Check that --dir points at extracted text (pdftotext output), not raw PDFs.`,
    );
    process.exit(1);
  }
}

// Run only when executed directly (not imported in tests)
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
