-- RA-7000 Knowledge Wiki — provenance + jurisdiction tagging on the RAG chunks.
--
-- Additive + idempotent + deploy-safe (prisma migrate deploy). NO drops, NO
-- column renames, NO data loss. Safe to replay: every statement guards with
-- IF NOT EXISTS / duplicate_object.
--
-- Governs the citation-vs-reasoning retrieval split (lib/rag/retrieve.ts):
--   * provenance = AUTHORITATIVE_STANDARD — citable standards text. Defaulted so
--     every pre-existing chunk keeps its current citable behaviour (nothing is
--     silently demoted out of report §-grounding).
--   * provenance = KNOWLEDGE — supporting knowledge; calc + Margot reasoning
--     may use it, report citations must not.
--   * jurisdiction — nullable source jurisdiction ("AU" | "NZ" | "INTL" | "US");
--     legacy rows stay NULL (unknown) until re-ingested.

-- CreateEnum (idempotent — CREATE TYPE has no IF NOT EXISTS, so guard it)
DO $$
BEGIN
  CREATE TYPE "ChunkProvenance" AS ENUM ('AUTHORITATIVE_STANDARD', 'KNOWLEDGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- IicrcChunk: NOT NULL provenance with a DEFAULT backfills existing rows to
-- AUTHORITATIVE_STANDARD; nullable jurisdiction adds cleanly with no backfill.
ALTER TABLE "IicrcChunk"
  ADD COLUMN IF NOT EXISTS "provenance" "ChunkProvenance" NOT NULL DEFAULT 'AUTHORITATIVE_STANDARD';
ALTER TABLE "IicrcChunk"
  ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT;

-- StandardsChunk already carries jurisdiction; only provenance is new here.
ALTER TABLE "StandardsChunk"
  ADD COLUMN IF NOT EXISTS "provenance" "ChunkProvenance" NOT NULL DEFAULT 'AUTHORITATIVE_STANDARD';

-- Indexes backing the retrieval split's provenance filter.
CREATE INDEX IF NOT EXISTS "IicrcChunk_provenance_idx" ON "IicrcChunk"("provenance");
CREATE INDEX IF NOT EXISTS "StandardsChunk_provenance_idx" ON "StandardsChunk"("provenance");
