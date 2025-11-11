-- Add full-text search support to StandardClause table
-- Run this in Supabase SQL Editor

-- Add generated tsvector column for full-text search
ALTER TABLE "StandardClause"
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS standard_clause_content_tsv_idx
  ON "StandardClause" USING GIN (content_tsv);

-- Optional: Add index on clauseNumber for faster sorting
CREATE INDEX IF NOT EXISTS standard_clause_number_idx
  ON "StandardClause" ("clauseNumber");

-- Optional: Add index on standardId for faster joins
CREATE INDEX IF NOT EXISTS standard_clause_standard_id_idx
  ON "StandardClause" ("standardId");

COMMENT ON COLUMN "StandardClause".content_tsv IS 'Generated tsvector for full-text search on content field';
