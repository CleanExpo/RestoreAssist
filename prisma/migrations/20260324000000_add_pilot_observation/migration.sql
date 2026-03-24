-- Migration: add_pilot_observation
-- Phase 2 pilot measurement infrastructure for NIR evidence claim validation.
-- Stores individual data points that contribute toward promoting HYPOTHESIS
-- claims in lib/nir-evidence-architecture.ts to VALIDATED status.
--
-- Foreign keys are stored as plain strings (no FK constraints) to avoid
-- modifying the large User and Inspection models in this migration.
-- Application-level validation ensures referential integrity.

CREATE TABLE "PilotObservation" (
    "id"               TEXT NOT NULL,
    "claimId"          TEXT NOT NULL,
    "observationType"  TEXT NOT NULL,
    "value"            DOUBLE PRECISION NOT NULL,
    "group"            TEXT NOT NULL DEFAULT 'nir',
    "inspectionId"     TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "context"          JSONB,
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotObservation_pkey" PRIMARY KEY ("id")
);

-- Index: query by claim for readiness evaluation
CREATE INDEX "PilotObservation_claimId_idx"        ON "PilotObservation"("claimId");
CREATE INDEX "PilotObservation_observationType_idx" ON "PilotObservation"("observationType");
CREATE INDEX "PilotObservation_group_idx"           ON "PilotObservation"("group");
CREATE INDEX "PilotObservation_inspectionId_idx"    ON "PilotObservation"("inspectionId");
CREATE INDEX "PilotObservation_createdAt_idx"       ON "PilotObservation"("createdAt");
