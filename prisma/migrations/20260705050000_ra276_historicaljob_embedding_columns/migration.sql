-- RA-276 (epic RA-272, Ascora AI learning model) — reconcile schema drift.
--
-- These columns and the HNSW index were applied directly to production
-- Supabase (udooysjajglluvuxkijp) by an earlier, unrecorded migration
-- (20260330011409_add_pgvector_historical_job_embeddings) that never landed
-- in this repo. lib/ai/embeddings.ts and lib/ai/rag-context.ts already read
-- and write these columns via raw SQL. This migration is a no-op replay on
-- prod (IF NOT EXISTS everywhere) that brings schema.prisma back in sync
-- with what's actually deployed, and lets a fresh environment (shadow DB,
-- new dev machine) provision the same columns from a clean migrate deploy.
--
-- Additive + idempotent + deploy-safe: no existing column is altered or
-- dropped, all ADD COLUMN / CREATE INDEX use IF NOT EXISTS, and the new
-- columns are nullable with no DEFAULT so they cannot fail on existing rows.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "HistoricalJob" ADD COLUMN IF NOT EXISTS "embeddedAt" TIMESTAMPTZ;

-- HNSW cosine index, matching the parameters already live on prod
-- (m=16, ef_construction=64 — optimal for OpenAI ada-002 / text-embedding-3
-- 1536-dim vectors).
CREATE INDEX IF NOT EXISTS idx_historical_job_embedding
    ON "HistoricalJob" USING hnsw ("embeddingVector" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
