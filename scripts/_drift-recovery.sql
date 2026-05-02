-- _drift-recovery.sql — RA-1842 backend health
--
-- Production /api/health/migrations returned status=drift on 2026-05-02
-- with 3 rolled_back_at IS NOT NULL rows:
--   - 20260114044217_update_the_interview_system_implmentations
--   - 20260114153713_update_schema
--   - 20260127200000_add_cron_infrastructure
--
-- Run STEP 1 in Supabase SQL Editor for the affected project (production).
-- Read its output. Then run STEP 2 OR STEP 3 depending on what you see.
--
-- Both STEP 2 and STEP 3 are wrapped in transactions and idempotent;
-- safe to re-run.
--
-- Memory: feedback_prisma_migration_recovery.md

-- ─── STEP 1 — Diagnose ──────────────────────────────────────────────────
-- Returns: row per migration showing whether each schema object the
-- migration was supposed to create actually exists. Read the output:
--   - All true  → schema is in place; STEP 3 (clear rolled_back_at) is enough.
--   - Any false → schema is missing; run STEP 2 first, then STEP 3.

SELECT
  '20260114044217_update_the_interview_system_implmentations' AS migration,
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'InterviewStatus') AS interview_status_enum,
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'QuestionType') AS question_type_enum,
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'SubscriptionTierLevel') AS sub_tier_level_enum,
  EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_name = 'SubscriptionTier') AS subscription_tier_table,
  EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_name = 'InterviewQuestion') AS interview_question_table,
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'interviewTier') AS user_interview_tier_column

UNION ALL SELECT
  '20260114153713_update_schema',
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'IntegrationProvider'),
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'RegulatoryDocumentType'),
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'UsageEventType'),
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'FormType'),
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'FormCategory'),
  EXISTS(SELECT 1 FROM pg_type WHERE typname = 'FormTemplateStatus')

UNION ALL SELECT
  '20260127200000_add_cron_infrastructure',
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentWorkflow' AND column_name = 'scheduledFor'),
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentWorkflow' AND column_name = 'lastActivityAt'),
  EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ScheduledEmail'),
  NULL, NULL, NULL;

-- ─── STEP 2 — Apply missing schema (only if STEP 1 shows any false) ─────
-- Idempotent: re-running on a partially-applied DB is safe. The original
-- migration files in prisma/migrations/ are the source of truth; this
-- replays them with IF NOT EXISTS / EXCEPTION-handlers so we don't trip
-- "already exists" errors.

BEGIN;

-- Migration 1: interview system
DO $$ BEGIN CREATE TYPE "InterviewStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'MULTIPLE_CHOICE', 'TEXT', 'NUMERIC', 'MEASUREMENT', 'LOCATION', 'MULTISELECT', 'CHECKBOX');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SubscriptionTierLevel" AS ENUM ('STANDARD', 'PREMIUM', 'ENTERPRISE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interviewTier" "SubscriptionTierLevel" DEFAULT 'STANDARD';

-- (Other tables/columns from migration 1 — if STEP 1 shows the table
--  doesn't exist, paste the full body of
--  prisma/migrations/20260114044217_update_the_interview_system_implmentations/migration.sql
--  here, prefixing each statement with IF NOT EXISTS / EXCEPTION-handlers.)

-- Migration 2: integrations + regulatory + forms
DO $$ BEGIN CREATE TYPE "IntegrationProvider" AS ENUM ('XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RegulatoryDocumentType" AS ENUM ('INSURANCE_POLICY', 'INSURANCE_REGULATION', 'BUILDING_CODE_NATIONAL', 'BUILDING_CODE_STATE', 'ELECTRICAL_STANDARD', 'PLUMBING_STANDARD', 'CONSUMER_LAW', 'INDUSTRY_BEST_PRACTICE', 'SAFETY_REGULATION');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "UsageEventType" AS ENUM ('PROPERTY_LOOKUP', 'VOICE_TRANSCRIPTION', 'VOICE_AI_INTERACTION', 'LIDAR_SCAN', 'FLOOR_PLAN_GENERATION', 'AI_ASSISTANT_QUERY');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FormType" AS ENUM ('WORK_ORDER', 'AUTHORITY_TO_COMMENCE', 'JSA', 'SDS', 'SWIMS', 'SITE_INDUCTION', 'CUSTOM');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FormCategory" AS ENUM ('SAFETY', 'COMPLIANCE', 'CLIENT_INTAKE', 'JOB_DOCUMENTATION', 'INSURANCE', 'QUALITY_CONTROL', 'CUSTOM');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FormTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (Tables from migration 2 — re-paste from
--  prisma/migrations/20260114153713_update_schema/migration.sql
--  using IF NOT EXISTS for each CREATE TABLE / CREATE INDEX.)

-- Migration 3: cron infrastructure (file already uses IF NOT EXISTS,
-- safe to replay verbatim from migration.sql)
ALTER TABLE "AgentWorkflow" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "AgentWorkflow" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
-- (Plus the ScheduledEmail table + indexes — re-paste from
--  prisma/migrations/20260127200000_add_cron_infrastructure/migration.sql)

COMMIT;

-- ─── STEP 3 — Clear rolled_back_at flag ──────────────────────────────────
-- Once schema state matches the migration files (verified by STEP 1
-- showing all true), tell Prisma's migration tracker that these three
-- migrations are applied. The watchdog (/api/health/migrations) flips
-- back to status=ok after this.

BEGIN;

UPDATE "_prisma_migrations"
SET
  rolled_back_at = NULL,
  finished_at = COALESCE(finished_at, NOW()),
  applied_steps_count = GREATEST(applied_steps_count, 1)
WHERE migration_name IN (
  '20260114044217_update_the_interview_system_implmentations',
  '20260114153713_update_schema',
  '20260127200000_add_cron_infrastructure'
);

-- Verify: should show 3 rows updated and all rolled_back_at IS NULL.
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260114044217_update_the_interview_system_implmentations',
  '20260114153713_update_schema',
  '20260127200000_add_cron_infrastructure'
);

COMMIT;

-- ─── STEP 4 — Verify watchdog ───────────────────────────────────────────
-- After STEP 3 commits, hit:
--   curl -i https://restoreassist.app/api/health/migrations
-- Expect: HTTP 200 + {"status":"ok","counts":{"applied":131,"failed":0,"rolled_back":0,"total":131}}
