-- Migration: historical_job_vector_fields
-- Date: 2026-04-09
-- Adds vector similarity search fields to HistoricalJob (Ascora AI learning model).
-- Depends on: 20260409000000_add_historical_jobs (table must exist)
--             20260406_iicrc_chunk_pgvector (CREATE EXTENSION vector already run)

-- embeddingVector: 1536-dim pgvector column (text-embedding-3-small / hash-fallback)
ALTER TABLE "HistoricalJob"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536),
  ADD COLUMN IF NOT EXISTS "embeddingModel"  TEXT,
  ADD COLUMN IF NOT EXISTS "embeddedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "itemCount"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "equipmentCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customFields"    JSONB;

-- HNSW index for fast approximate nearest-neighbour cosine search.
-- ef_construction=128, m=16 are pgvector defaults; good for 1536-dim vectors.
-- Only indexes rows where embeddingVector IS NOT NULL (partial index reduces size).
CREATE INDEX IF NOT EXISTS "HistoricalJob_embedding_hnsw_idx"
  ON "HistoricalJob"
  USING hnsw ("embeddingVector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE "embeddingVector" IS NOT NULL;

-- Support filtering un-embedded rows efficiently
CREATE INDEX IF NOT EXISTS "HistoricalJob_embeddedAt_idx"
  ON "HistoricalJob" ("embeddedAt");
