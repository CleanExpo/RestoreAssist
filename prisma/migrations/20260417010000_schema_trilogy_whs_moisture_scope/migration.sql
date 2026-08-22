-- RA-1140: WHSIncident + WHSCorrectiveAction (RA-80 claimed Done 2026-03-05 but never shipped)
-- RA-1141: MoistureReading device fields (unblocks RA-1121 BLE ingest)
-- RA-1142: ScopeItem.clauseRef (stops JSON-in-justification hack; unblocks RA-1131 PDF citations)
-- Generated: 2026-04-17
-- --create-only: this migration is NOT applied. Review before `prisma migrate deploy`.
-- Safe migration: only adds new tables + new optional columns. No destructive changes.

-- ============================================================
-- WHSIncident: WHS hazard/incident records per user/inspection
-- Shape matches app/dashboard/whs/page.tsx WHSIncident interface
-- ============================================================
CREATE TABLE IF NOT EXISTS "WHSIncident" (
    "id"               TEXT NOT NULL,
    "inspectionId"     TEXT,
    "userId"           TEXT NOT NULL,
    "incidentType"     TEXT NOT NULL,
    "severity"         TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'OPEN',
    "incidentDate"     TIMESTAMP(3) NOT NULL,
    "location"         TEXT,
    "injuredParty"     TEXT,
    "injuryDescription" TEXT,
    "description"      TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WHSIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WHSIncident_inspectionId_idx"
    ON "WHSIncident"("inspectionId");

CREATE INDEX IF NOT EXISTS "WHSIncident_userId_createdAt_idx"
    ON "WHSIncident"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "WHSIncident_incidentType_severity_idx"
    ON "WHSIncident"("incidentType", "severity");

CREATE INDEX IF NOT EXISTS "WHSIncident_status_idx"
    ON "WHSIncident"("status");

ALTER TABLE "WHSIncident"
    ADD CONSTRAINT "WHSIncident_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- WHSCorrectiveAction: corrective actions linked to WHSIncident
-- ============================================================
CREATE TABLE IF NOT EXISTS "WHSCorrectiveAction" (
    "id"          TEXT NOT NULL,
    "incidentId"  TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo"  TEXT,
    "completed"   BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueDate"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WHSCorrectiveAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WHSCorrectiveAction_incidentId_idx"
    ON "WHSCorrectiveAction"("incidentId");

CREATE INDEX IF NOT EXISTS "WHSCorrectiveAction_assignedTo_completed_idx"
    ON "WHSCorrectiveAction"("assignedTo", "completed");

ALTER TABLE "WHSCorrectiveAction"
    ADD CONSTRAINT "WHSCorrectiveAction_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "WHSIncident"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- MoistureReading: add 4 optional device/source columns (RA-1141)
-- All optional — existing rows unaffected, no backfill needed
-- ============================================================
ALTER TABLE "MoistureReading"
    ADD COLUMN IF NOT EXISTS "unit"         TEXT,
    ADD COLUMN IF NOT EXISTS "deviceVendor" TEXT,
    ADD COLUMN IF NOT EXISTS "deviceModel"  TEXT,
    ADD COLUMN IF NOT EXISTS "source"       TEXT DEFAULT 'manual';

-- ============================================================
-- ScopeItem: add clauseRef column (RA-1142)
-- Optional — existing rows unaffected, no backfill needed
-- ============================================================
ALTER TABLE "ScopeItem"
    ADD COLUMN IF NOT EXISTS "clauseRef" TEXT;
