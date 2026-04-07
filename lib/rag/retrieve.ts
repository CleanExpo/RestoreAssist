/**
 * RA-434: IICRC RAG retrieval — pgvector cosine similarity search.
 * Queries IicrcChunk using the <=> operator (cosine distance).
 */
import { prisma } from "@/lib/prisma";
import { embedText } from "./embed";

export interface ChunkResult {
  id: string;
  standard: string;
  edition: string;
  section: string;
  heading: string;
  content: string;
  similarity: number;
}

/**
 * Retrieve the top-k most relevant IICRC chunks for a query.
 * @param query     Natural language question or keyword phrase
 * @param k         Number of results to return (default 5)
 * @param standard  Optional — filter to a specific standard e.g. "S500"
 */
export async function retrieveChunks(
  query: string,
  k = 5,
  standard?: string,
): Promise<ChunkResult[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  // Raw SQL required — Prisma doesn't support the pgvector <=> operator natively
  const rows = await prisma.$queryRawUnsafe<ChunkResult[]>(
    `
    SELECT
      id,
      standard,
      edition,
      section,
      heading,
      content,
      1 - (embedding <=> $1::vector) AS similarity
    FROM "IicrcChunk"
    ${standard ? `WHERE standard = $2` : ""}
    ORDER BY embedding <=> $1::vector
    LIMIT $${standard ? 3 : 2}
    `,
    vectorLiteral,
    ...(standard ? [standard, k] : [k]),
  );

  return rows;
}

/**
 * Format retrieved chunks as a system-prompt context block.
 * Suitable for injection into AI report generation prompts.
 */
export function formatChunksAsContext(chunks: ChunkResult[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map(
      (c) =>
        `[${c.standard}:${c.edition} ${c.section} — ${c.heading}]\n${c.content}`,
    )
    .join("\n\n---\n\n");
}
