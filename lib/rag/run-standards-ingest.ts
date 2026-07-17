/**
 * Run IICRC chunk → embed → upsert for admin/cron ingest callers.
 */

import { prisma } from "@/lib/prisma";
import {
  chunkText,
  extractSection,
  buildContentHash,
  upsertChunk,
  assertEmbeddingShape,
  parseProvenance,
} from "@/scripts/ingest-iicrc";
import type { RagIngestBody } from "@/lib/rag/ingest-body";

export async function runStandardsIngest(body: RagIngestBody): Promise<{
  standard: string;
  edition: string;
  filesProcessed: number;
  chunksUpserted: number;
  chunksSkipped: number;
}> {
  const { standard, edition, jurisdiction, files } = body;
  const provenance = parseProvenance(body.provenance);
  const { embedBatch } = await import("@/lib/rag/embed");

  const summary = {
    standard,
    edition,
    filesProcessed: 0,
    chunksUpserted: 0,
    chunksSkipped: 0,
  };
  const BATCH = 100;

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

  return summary;
}
