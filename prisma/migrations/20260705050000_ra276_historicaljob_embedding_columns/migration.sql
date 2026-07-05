-- RA-276 (epic RA-272, Ascora AI learning model) + RA-274 ("CEO Board
-- Hardening") — reconcile HistoricalJob schema drift.
--
-- Eleven columns and the HNSW index were applied directly to production
-- Supabase (udooysjajglluvuxkijp) by earlier, unrecorded migrations
-- (embeddings: 20260330011409_add_pgvector_historical_job_embeddings; the
-- board-hardening + corpus-count columns from RA-274) that never landed in
-- this repo. lib/ai/embeddings.ts and lib/ai/rag-context.ts already read and
-- write the embedding + itemCount/equipmentCount columns via raw SQL / an
-- untyped Prisma cast. All eleven columns were re-verified against prod on
-- 2026-07-05. This migration is a no-op replay on prod (IF NOT EXISTS
-- everywhere) that brings schema.prisma back in sync with what's actually
-- deployed, and lets a fresh environment (shadow DB, new dev machine)
-- provision the same columns + index from a clean migrate deploy.
--
-- Additive + idempotent + deploy-safe: no existing column is altered or
-- dropped, all ADD COLUMN / CREATE INDEX use IF NOT EXISTS. itemCount and
-- equipmentCount are NOT NULL DEFAULT 0 (matching prod), so the ADD COLUMN
-- backfills existing rows with 0 and cannot fail; every other new column is
-- nullable with no DEFAULT.

CREATE EXTENSION IF NOT EXISTS vector;

-- Similarity-search corpus counts (NOT NULL DEFAULT 0 on prod)
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "itemCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "equipmentCount" INTEGER NOT NULL DEFAULT 0;

-- RA-274 classification + claim metadata (all nullable on prod)
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "classificationSource" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "insurerName" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "claimNumber" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "scopeOfWorks" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "totalLabourHours" DOUBLE PRECISION;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER;

-- pgvector embedding columns (all nullable on prod)
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddedAt" TIMESTAMPTZ;

-- HNSW cosine index, matching the parameters already live on prod
-- (m=16, ef_construction=64 — optimal for OpenAI ada-002 / text-embedding-3
-- 1536-dim vectors).
CREATE INDEX IF NOT EXISTS idx_historical_job_embedding
    ON "HistoricalJob" USING hnsw ("embeddingVector" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
