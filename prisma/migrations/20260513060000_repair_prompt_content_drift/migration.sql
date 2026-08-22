-- Migration: repair_prompt_content_drift
-- Date: 2026-05-13
-- Issue: #962 (PR-B — schema-only drift cleanup)
--
-- HISTORY
-- ───────
-- Two earlier migrations created tables that schema.prisma never declared,
-- so the CI drift-check (scripts/check-schema-drift.mjs) had nothing to test
-- against, but the drift-check now sees the new model declarations in
-- schema.prisma and would flag any environment where the tables are missing.
--
--   20260330200000_add_prompt_experiments  →  PromptVariant, EvaluationRun
--   20260331000000_add_content_automation  →  ContentJob, ContentPost,
--                                              ContentAnalytics
--
-- Per the discovery audit:
--   • PromptVariant and EvaluationRun already exist on BOTH prod and sandbox
--     (created by the original phase 2 migration). For both environments this
--     migration's `CREATE TABLE IF NOT EXISTS` is a true no-op.
--   • ContentJob, ContentPost, ContentAnalytics exist on sandbox only
--     (the original migration row was marked applied on prod with
--     `applied_steps_count = 0`, so the DDL never ran). On prod this migration
--     creates the three tables for real; on sandbox it is a no-op.
--
-- Companion PR-B changes
-- ──────────────────────
-- This PR also adds five model declarations to prisma/schema.prisma so the
-- drift check stops flagging the existing prod tables. No application code
-- consumes these tables today — the feature surfaces are dormant on the
-- client side; the rows exist only at the DB layer.
--
-- Idempotency
-- ───────────
-- Every DDL statement below uses `IF NOT EXISTS` so re-running this migration
-- (or running it against an environment that already has the table/index/FK)
-- is safe.

-- ── PromptVariant ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PromptVariant" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "claimType"        TEXT NOT NULL,
  "promptText"       TEXT NOT NULL,
  "version"          INTEGER NOT NULL DEFAULT 1,
  "parentVariantId"  TEXT,
  "compositeScore"   DOUBLE PRECISION,
  "structuralScore"  DOUBLE PRECISION,
  "citationScore"    DOUBLE PRECISION,
  "equipmentScore"   DOUBLE PRECISION,
  "specificityScore" DOUBLE PRECISION,
  "categoryScore"    DOUBLE PRECISION,
  "isProduction"     BOOLEAN NOT NULL DEFAULT false,
  "description"      TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PromptVariant_claimType_isProduction_idx"
  ON "PromptVariant"("claimType", "isProduction");
CREATE INDEX IF NOT EXISTS "PromptVariant_claimType_compositeScore_idx"
  ON "PromptVariant"("claimType", "compositeScore");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PromptVariant_parentVariantId_fkey'
      AND table_name = 'PromptVariant'
  ) THEN
    ALTER TABLE "PromptVariant"
      ADD CONSTRAINT "PromptVariant_parentVariantId_fkey"
      FOREIGN KEY ("parentVariantId") REFERENCES "PromptVariant"("id");
  END IF;
END $$;

-- ── EvaluationRun ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EvaluationRun" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "promptVariantId"  TEXT,
  "testCaseId"       TEXT NOT NULL,
  "generatedScope"   TEXT NOT NULL,
  "compositeScore"   DOUBLE PRECISION NOT NULL,
  "structuralScore"  DOUBLE PRECISION,
  "citationScore"    DOUBLE PRECISION,
  "equipmentScore"   DOUBLE PRECISION,
  "specificityScore" DOUBLE PRECISION,
  "categoryScore"    DOUBLE PRECISION,
  "inputTokens"      INTEGER,
  "outputTokens"     INTEGER,
  "costAud"          DOUBLE PRECISION,
  "durationMs"       INTEGER,
  "model"            TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EvaluationRun_promptVariantId_idx"
  ON "EvaluationRun"("promptVariantId");
CREATE INDEX IF NOT EXISTS "EvaluationRun_testCaseId_idx"
  ON "EvaluationRun"("testCaseId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EvaluationRun_promptVariantId_fkey'
      AND table_name = 'EvaluationRun'
  ) THEN
    ALTER TABLE "EvaluationRun"
      ADD CONSTRAINT "EvaluationRun_promptVariantId_fkey"
      FOREIGN KEY ("promptVariantId") REFERENCES "PromptVariant"("id");
  END IF;
END $$;

-- ── ContentJob ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContentJob" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "product"           TEXT NOT NULL,
  "angle"             TEXT NOT NULL,
  "platform"          TEXT NOT NULL,
  "duration"          INTEGER NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "hook"              TEXT,
  "agitation"         TEXT,
  "solution"          TEXT,
  "cta"               TEXT,
  "voiceoverText"     TEXT,
  "caption"           TEXT,
  "hashtags"          TEXT,
  "audioUrl"          TEXT,
  "videoUrl"          TEXT,
  "heygenRenderJobId" TEXT,
  "errorMessage"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentJob_userId_idx"    ON "ContentJob"("userId");
CREATE INDEX IF NOT EXISTS "ContentJob_status_idx"    ON "ContentJob"("status");
CREATE INDEX IF NOT EXISTS "ContentJob_platform_idx"  ON "ContentJob"("platform");
CREATE INDEX IF NOT EXISTS "ContentJob_createdAt_idx" ON "ContentJob"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ContentJob_userId_fkey'
      AND table_name = 'ContentJob'
  ) THEN
    ALTER TABLE "ContentJob"
      ADD CONSTRAINT "ContentJob_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── ContentPost ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContentPost" (
  "id"             TEXT NOT NULL,
  "jobId"          TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "externalPostId" TEXT,
  "postUrl"        TEXT,
  "scheduledAt"    TIMESTAMP(3),
  "postedAt"       TIMESTAMP(3),
  "status"         TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentPost_jobId_idx"       ON "ContentPost"("jobId");
CREATE INDEX IF NOT EXISTS "ContentPost_platform_idx"    ON "ContentPost"("platform");
CREATE INDEX IF NOT EXISTS "ContentPost_status_idx"      ON "ContentPost"("status");
CREATE INDEX IF NOT EXISTS "ContentPost_scheduledAt_idx" ON "ContentPost"("scheduledAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ContentPost_jobId_fkey'
      AND table_name = 'ContentPost'
  ) THEN
    ALTER TABLE "ContentPost"
      ADD CONSTRAINT "ContentPost_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── ContentAnalytics ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContentAnalytics" (
  "id"         TEXT NOT NULL,
  "postId"     TEXT NOT NULL,
  "views"      INTEGER NOT NULL DEFAULT 0,
  "likes"      INTEGER NOT NULL DEFAULT 0,
  "shares"     INTEGER NOT NULL DEFAULT 0,
  "comments"   INTEGER NOT NULL DEFAULT 0,
  "reach"      INTEGER NOT NULL DEFAULT 0,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContentAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentAnalytics_postId_idx"     ON "ContentAnalytics"("postId");
CREATE INDEX IF NOT EXISTS "ContentAnalytics_recordedAt_idx" ON "ContentAnalytics"("recordedAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ContentAnalytics_postId_fkey'
      AND table_name = 'ContentAnalytics'
  ) THEN
    ALTER TABLE "ContentAnalytics"
      ADD CONSTRAINT "ContentAnalytics_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "ContentPost"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
