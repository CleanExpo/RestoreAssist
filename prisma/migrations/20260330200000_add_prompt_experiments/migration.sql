-- Migration: add_prompt_experiments
-- Adds PromptVariant and EvaluationRun tables for autonomous prompt optimisation loop
-- (autoresearch pattern: score → mutate → compare → promote)

CREATE TABLE "PromptVariant" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "claimType"        TEXT NOT NULL,
  "promptText"       TEXT NOT NULL,
  "version"          INTEGER NOT NULL DEFAULT 1,
  "parentVariantId"  TEXT REFERENCES "PromptVariant"("id"),
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

CREATE INDEX "PromptVariant_claimType_isProduction_idx" ON "PromptVariant"("claimType", "isProduction");
CREATE INDEX "PromptVariant_claimType_compositeScore_idx" ON "PromptVariant"("claimType", "compositeScore");

CREATE TABLE "EvaluationRun" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "promptVariantId"  TEXT REFERENCES "PromptVariant"("id"),
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

CREATE INDEX "EvaluationRun_promptVariantId_idx" ON "EvaluationRun"("promptVariantId");
CREATE INDEX "EvaluationRun_testCaseId_idx" ON "EvaluationRun"("testCaseId");
