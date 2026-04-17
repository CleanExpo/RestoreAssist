-- RA-1131: SwmsDraft — auto-generated Safe Work Method Statement per inspection
-- Generated: 2026-04-17
-- Safe migration: new table only, no destructive changes, no data loss risk.

CREATE TABLE IF NOT EXISTS "SwmsDraft" (
    "id"             TEXT NOT NULL,
    "inspectionId"   TEXT NOT NULL,
    "contentJson"    TEXT NOT NULL,
    "signedAt"       TIMESTAMP(3),
    "signedByUserId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwmsDraft_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one draft per inspection
CREATE UNIQUE INDEX IF NOT EXISTS "SwmsDraft_inspectionId_key"
    ON "SwmsDraft"("inspectionId");

-- Index for lookups by inspection
CREATE INDEX IF NOT EXISTS "SwmsDraft_inspectionId_idx"
    ON "SwmsDraft"("inspectionId");

-- Foreign key to Inspection (cascade delete)
ALTER TABLE "SwmsDraft"
    ADD CONSTRAINT "SwmsDraft_inspectionId_fkey"
    FOREIGN KEY ("inspectionId")
    REFERENCES "Inspection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
