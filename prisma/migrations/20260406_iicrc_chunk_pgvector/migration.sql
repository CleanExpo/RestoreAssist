-- RA-434: Add IicrcChunk model for pgvector RAG knowledge base
-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- IicrcChunk table for pre-indexed IICRC PDF chunks with embeddings
CREATE TABLE IF NOT EXISTS "IicrcChunk" (
    "id"          TEXT NOT NULL,
    "standard"    TEXT NOT NULL,
    "edition"     TEXT NOT NULL,
    "section"     TEXT NOT NULL,
    "heading"     TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "pageNumber"  INTEGER,
    "embedding"   vector(1536),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IicrcChunk_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on contentHash (prevents duplicate chunks on re-ingest)
CREATE UNIQUE INDEX IF NOT EXISTS "IicrcChunk_contentHash_key" ON "IicrcChunk"("contentHash");

-- Index for standard+edition filtering
CREATE INDEX IF NOT EXISTS "IicrcChunk_standard_edition_idx" ON "IicrcChunk"("standard", "edition");

-- Index for section lookup
CREATE INDEX IF NOT EXISTS "IicrcChunk_section_idx" ON "IicrcChunk"("section");

-- IVFFlat index for approximate nearest-neighbour vector search
-- lists=100 is appropriate for tables up to ~1M rows
CREATE INDEX IF NOT EXISTS "IicrcChunk_embedding_idx"
    ON "IicrcChunk" USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
