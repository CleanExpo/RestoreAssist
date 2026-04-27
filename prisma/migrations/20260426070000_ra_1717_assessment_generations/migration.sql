-- RA-1717 — Unified assessment generation pipeline.
-- Persists report + scope + estimate artefacts for each (inspection, type)
-- generation. Latest by generatedAt is canonical; older rows are audit.

CREATE TABLE "AssessmentGeneration" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "reportSections" JSONB NOT NULL,
    "scopeItems" JSONB NOT NULL,
    "estimateLines" JSONB NOT NULL,
    "citations" JSONB NOT NULL,
    "modelUsed" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "costEstimateUsd" DOUBLE PRECISION,
    "workspaceId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,

    CONSTRAINT "AssessmentGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssessmentGeneration_inspectionId_generatedAt_idx"
    ON "AssessmentGeneration"("inspectionId", "generatedAt");

CREATE INDEX "AssessmentGeneration_assessmentType_generatedAt_idx"
    ON "AssessmentGeneration"("assessmentType", "generatedAt");

CREATE INDEX "AssessmentGeneration_workspaceId_idx"
    ON "AssessmentGeneration"("workspaceId");

ALTER TABLE "AssessmentGeneration"
    ADD CONSTRAINT "AssessmentGeneration_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentGeneration"
    ADD CONSTRAINT "AssessmentGeneration_generatedById_fkey"
    FOREIGN KEY ("generatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
