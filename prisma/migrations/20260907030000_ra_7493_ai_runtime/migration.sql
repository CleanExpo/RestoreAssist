-- RA-7493: the AI runtime's data layer — five tables, four enums, nothing else.
--
-- Phase 0 of the six-runner AI runtime. Data only: no runner exists yet, and no
-- runner will run for a workspace without an AiRunnerFlag row saying so.
--
-- WHAT IT ADDS
--   AiRunnerFlag     per-(workspace, runner) operational switch + kill-switch.
--                    NO ROW MEANS OFF, so nothing turns on by accident and no
--                    backfill is needed.
--   AiRunnerBudget   spend/token ceiling per window. Money is BIGINT micro-USD,
--                    never a float, because a ceiling has to refuse exactly at
--                    a boundary.
--   AiRunnerReceipt  append-only, one row per attempted runner call, carrying
--                    which key paid (keySource) so the published BYOK promise
--                    becomes queryable instead of asserted.
--   AiJobSuggestion  the Job Copilot's queue: a proposal on a job record plus
--                    the human's accept/dismiss verdict.
--   AiStyleProfile   per-tenant writing profile, opt-in, logically deletable.
--
-- ADDITIVE, AND THAT IS CHECKED, NOT ASSERTED
--   Every statement below is CREATE TYPE, CREATE TABLE, CREATE INDEX or
--   ADD CONSTRAINT against an object this migration itself creates. Not one
--   line alters, renames, retypes or drops anything that existed before it.
--   `bash scripts/ci/migration-roundtrip.sh additive-only` fails the build if
--   that ever stops being true.
--
--   The SQL was generated with
--     prisma migrate diff --from-schema <schema.prisma at the merge base>
--                         --to-schema   prisma/schema.prisma --script
--   deliberately NOT from the live migration history. Diffing from the history
--   drags in ~143 statements of PRE-EXISTING divergence between this repo's
--   migrations and its schema.prisma (timestamp precision, dropped defaults,
--   index names) which is real, is not this branch's, and must not be smuggled
--   into an unrelated migration. See the RA-7493 scoreboard for the detail.
--
-- REVERSIBLE
--   down.sql in this directory drops exactly what this file creates, in
--   dependency order, and `migration-roundtrip.sh rollback` proves the objects
--   are gone afterwards — with a positive control first, so "zero remaining"
--   cannot be a query looking in the wrong place.

-- CreateEnum
CREATE TYPE "AiRunner" AS ENUM ('GOVERNOR', 'INGESTION', 'FIELD', 'JOB_COPILOT', 'STYLE', 'SELF_HEAL');

-- CreateEnum
CREATE TYPE "AiKeySource" AS ENUM ('TENANT_BYOK', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AiReceiptOutcome" AS ENUM ('PENDING', 'OK', 'REFUSED_NO_KEY', 'REFUSED_BUDGET', 'REFUSED_FLAG_OFF', 'FAILED');

-- CreateEnum
CREATE TYPE "AiSuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AiRunnerFlag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runner" "AiRunner" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "killedAt" TIMESTAMP(3),
    "killedReason" TEXT,
    "enabledByUserId" TEXT,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRunnerFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunnerBudget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runner" "AiRunner",
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "maxMicroUsd" BIGINT NOT NULL,
    "spentMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "maxTokens" BIGINT,
    "spentTokens" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRunnerBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunnerReceipt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "runner" "AiRunner" NOT NULL,
    "taskType" TEXT NOT NULL,
    "provider" "AiProvider",
    "model" TEXT,
    "keySource" "AiKeySource",
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "outcome" "AiReceiptOutcome" NOT NULL DEFAULT 'PENDING',
    "errorType" TEXT,
    "provenance" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AiRunnerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobSuggestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "runner" "AiRunner" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "grounding" JSONB,
    "state" "AiSuggestionState" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "receiptId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJobSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiStyleProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "sourceDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "lastBuiltAt" TIMESTAMP(3),
    "consentedAt" TIMESTAMP(3),
    "consentedByUserId" TEXT,
    "exportedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRunnerFlag_workspaceId_idx" ON "AiRunnerFlag"("workspaceId");

-- CreateIndex
CREATE INDEX "AiRunnerFlag_runner_enabled_idx" ON "AiRunnerFlag"("runner", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerFlag_workspaceId_runner_key" ON "AiRunnerFlag"("workspaceId", "runner");

-- CreateIndex
CREATE INDEX "AiRunnerBudget_workspaceId_periodEnd_idx" ON "AiRunnerBudget"("workspaceId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerBudget_workspaceId_runner_periodStart_key" ON "AiRunnerBudget"("workspaceId", "runner", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerReceipt_supersedesId_key" ON "AiRunnerReceipt"("supersedesId");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_workspaceId_createdAt_idx" ON "AiRunnerReceipt"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_inspectionId_createdAt_idx" ON "AiRunnerReceipt"("inspectionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_runner_outcome_idx" ON "AiRunnerReceipt"("runner", "outcome");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_workspaceId_keySource_idx" ON "AiRunnerReceipt"("workspaceId", "keySource");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerReceipt_workspaceId_idempotencyKey_key" ON "AiRunnerReceipt"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_workspaceId_state_idx" ON "AiJobSuggestion"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_inspectionId_state_createdAt_idx" ON "AiJobSuggestion"("inspectionId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_runner_state_idx" ON "AiJobSuggestion"("runner", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AiStyleProfile_workspaceId_key" ON "AiStyleProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "AiStyleProfile_deletedAt_idx" ON "AiStyleProfile"("deletedAt");

-- AddForeignKey
ALTER TABLE "AiRunnerFlag" ADD CONSTRAINT "AiRunnerFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerBudget" ADD CONSTRAINT "AiRunnerBudget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AiRunnerReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "AiRunnerReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiStyleProfile" ADD CONSTRAINT "AiStyleProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

