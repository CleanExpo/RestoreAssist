/**
 * RA-434 / RA-7000: IICRC RAG retrieval — pgvector cosine similarity search.
 * Queries IicrcChunk using the <=> operator (cosine distance).
 *
 * ── Provenance-aware retrieval split (RA-7000 Knowledge Wiki) ────────────────
 * One corpus grounds report citations, calculations, and Margot reasoning, but
 * they may NOT all draw from the same tier of it:
 *
 *   retrieveForCitation(query, opts)  → ONLY provenance = AUTHORITATIVE_STANDARD.
 *                                       The single surface a report §-citation /
 *                                       compliance-grounding may quote. Never
 *                                       returns KNOWLEDGE chunks, so a citation
 *                                       can only ever point at authoritative,
 *                                       citable standards text.
 *   retrieveForReasoning(query, opts) → ALL provenance tiers (authoritative +
 *                                       knowledge). What calculations and Margot
 *                                       reasoning may use, since they reason over
 *                                       everything but do not emit citations.
 *
 * Every result carries `provenance` + `jurisdiction` alongside
 * `standard`/`edition`/`section`/`heading`, so a consumer can both cite
 * correctly (edition + section) and emit the right AU/NZ jurisdiction.
 *
 * The legacy `retrieveChunks()` is unchanged in signature and behaviour (it
 * returns all tiers) and is kept for existing consumers; new consumers should
 * pick `retrieveForCitation` or `retrieveForReasoning` explicitly.
 */
import { prisma } from "@/lib/prisma";
import { embedText } from "./embed";

/** Mirrors the ChunkProvenance Prisma enum (prisma/schema.prisma). */
export type ChunkProvenance = "AUTHORITATIVE_STANDARD" | "KNOWLEDGE";

export interface ChunkResult {
  id: string;
  standard: string;
  edition: string;
  section: string;
  heading: string;
  content: string;
  /** RA-7000: which tier this chunk belongs to (governs citation eligibility). */
  provenance: ChunkProvenance;
  /** RA-7000: source jurisdiction ("AU" | "NZ" | "INTL" | "US"); null = legacy/unknown. */
  jurisdiction: string | null;
  similarity: number;
}

export interface RetrieveOptions {
  /** Number of results to return (default 5). */
  k?: number;
  /** Optional — restrict to a single standard, e.g. "S500". */
  standard?: string;
  /** Optional — restrict to a single jurisdiction, e.g. "AU" or "NZ". */
  jurisdiction?: string;
}

/**
 * Core vector search over IicrcChunk. `provenance`, when set, restricts the
 * result to that single tier; when omitted, all tiers are returned.
 *
 * Raw SQL is required — Prisma doesn't support the pgvector <=> operator
 * natively. All user-controlled values are passed as bind parameters (never
 * interpolated into the SQL text).
 */
async function queryChunks(
  query: string,
  opts: RetrieveOptions & { provenance?: ChunkProvenance } = {},
): Promise<ChunkResult[]> {
  const { k = 5, standard, jurisdiction, provenance } = opts;
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  const values: unknown[] = [vectorLiteral];
  const conditions: string[] = [];

  if (provenance) {
    values.push(provenance);
    conditions.push(`provenance = $${values.length}::"ChunkProvenance"`);
  }
  if (standard) {
    values.push(standard);
    conditions.push(`standard = $${values.length}`);
  }
  if (jurisdiction) {
    values.push(jurisdiction);
    conditions.push(`jurisdiction = $${values.length}`);
  }

  values.push(k);
  const limitPlaceholder = `$${values.length}`;
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return prisma.$queryRawUnsafe<ChunkResult[]>(
    `
    SELECT
      id,
      standard,
      edition,
      section,
      heading,
      content,
      provenance,
      jurisdiction,
      1 - (embedding <=> $1::vector) AS similarity
    FROM "IicrcChunk"
    ${where}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limitPlaceholder}
    `,
    ...values,
  );
}

/**
 * Retrieve chunks for a REPORT CITATION / compliance-grounding.
 *
 * Returns ONLY `provenance = AUTHORITATIVE_STANDARD` chunks — the only tier a
 * report is allowed to cite. A KNOWLEDGE chunk can never leak into a citation
 * through this path. Each result carries edition + section (cite as
 * `S500:2021 §7.1`) and jurisdiction (emit the correct AU/NZ context).
 */
export async function retrieveForCitation(
  query: string,
  opts: RetrieveOptions = {},
): Promise<ChunkResult[]> {
  return queryChunks(query, { ...opts, provenance: "AUTHORITATIVE_STANDARD" });
}

/**
 * Retrieve chunks for CALCULATIONS and MARGOT REASONING.
 *
 * Returns ALL provenance tiers (authoritative standards AND supporting
 * knowledge). Use for reasoning that does not emit a citation. Each result
 * still carries its `provenance` so a consumer can weight or label a source.
 */
export async function retrieveForReasoning(
  query: string,
  opts: RetrieveOptions = {},
): Promise<ChunkResult[]> {
  return queryChunks(query, opts);
}

/**
 * Retrieve the top-k most relevant IICRC chunks for a query (legacy API,
 * all provenance tiers). Kept for existing consumers; new consumers should
 * use `retrieveForCitation` or `retrieveForReasoning`.
 * @param query     Natural language question or keyword phrase
 * @param k         Number of results to return (default 5)
 * @param standard  Optional — filter to a specific standard e.g. "S500"
 */
export async function retrieveChunks(
  query: string,
  k = 5,
  standard?: string,
): Promise<ChunkResult[]> {
  return queryChunks(query, { k, standard });
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
