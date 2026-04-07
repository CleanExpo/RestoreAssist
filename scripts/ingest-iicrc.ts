/**
 * RA-434: IICRC PDF ingestion script — chunks PDFs and stores pgvector embeddings.
 *
 * Usage:
 *   npx tsx scripts/ingest-iicrc.ts --dir ./iicrc-pdfs --standard S500 --edition 2025
 *
 * Pre-extract PDF text first:
 *   pdftotext IICRC_S500_2025.pdf IICRC_S500_2025.txt
 *
 * Idempotent — upserts by contentHash. Safe to re-run.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

function parseArgs(): { dir: string; standard: string; edition: string } {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };
  return {
    dir: get("--dir", "./iicrc-pdfs"),
    standard: get("--standard", "S500"),
    edition: get("--edition", "2025"),
  };
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

function extractSection(chunk: string): { section: string; heading: string } {
  const match = chunk.match(/§\s*[\d.]+[a-z]?/i);
  const headingMatch = chunk.match(/^([A-Z][A-Za-z\s]{5,60})$/m);
  return {
    section: match?.[0]?.replace(/\s+/g, "") ?? "General",
    heading: headingMatch?.[1]?.trim() ?? chunk.slice(0, 60).trim(),
  };
}

async function embedBatchDynamic(texts: string[]): Promise<number[][]> {
  // Dynamic import to avoid requiring OPENAI_API_KEY at module load time
  const { embedBatch } = await import("../lib/rag/embed");
  return embedBatch(texts);
}

async function main() {
  const { dir, standard, edition } = parseArgs();
  console.log(`Ingesting ${standard}:${edition} from ${dir}`);

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt") || f.endsWith(".pdf"));

  if (files.length === 0) {
    console.log(
      "No .txt or .pdf files found. Extract text first with pdftotext.",
    );
    process.exit(0);
  }

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    console.log(`Processing: ${file}`);
    const text = fs.readFileSync(filePath, "utf-8");
    const chunks = chunkText(text);
    console.log(`  ${chunks.length} chunks`);

    const BATCH = 100;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedBatchDynamic(batch);

      for (let j = 0; j < batch.length; j++) {
        const content = batch[j];
        const contentHash = crypto
          .createHash("sha256")
          .update(content)
          .digest("hex");
        const { section, heading } = extractSection(content);
        const pageNumber = Math.floor((i + j) / 2) + 1;
        const vectorLiteral = `[${embeddings[j].join(",")}]`;

        const existing = await prisma.iicrcChunk.findUnique({
          where: { contentHash },
          select: { id: true },
        });

        if (existing) {
          totalSkipped++;
          continue;
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO "IicrcChunk" (id, standard, edition, section, heading, content, "contentHash", "pageNumber", embedding, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8::vector, NOW(), NOW())
           ON CONFLICT ("contentHash") DO NOTHING`,
          standard,
          edition,
          section,
          heading,
          content,
          contentHash,
          pageNumber,
          vectorLiteral,
        );
        totalUpserted++;
      }

      process.stdout.write(
        `  Progress: ${Math.min(i + BATCH, chunks.length)}/${chunks.length}\r`,
      );
    }
    console.log();
  }

  console.log(
    `\nDone. Upserted: ${totalUpserted}, Skipped (existing): ${totalSkipped}`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
