-- RA-405 / RA-401: Missing schema fields — EvidenceItem status, fileName, roomName
-- + EvidenceClass.AFFECTED_CONTENTS + Inspection.contentsManifestDraft
-- These fields were referenced in code (Sprint H) but never added to the schema.
-- Sprint N — 2026-04-08

-- 1. Add AFFECTED_CONTENTS to EvidenceClass enum
ALTER TYPE "EvidenceClass" ADD VALUE IF NOT EXISTS 'AFFECTED_CONTENTS';

-- 2. Create EvidenceItemStatus enum
DO $$ BEGIN
  CREATE TYPE "EvidenceItemStatus" AS ENUM ('ACTIVE', 'FLAGGED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Add missing fields to EvidenceItem
ALTER TABLE "EvidenceItem"
  ADD COLUMN IF NOT EXISTS "fileName"  TEXT,
  ADD COLUMN IF NOT EXISTS "roomName"  TEXT,
  ADD COLUMN IF NOT EXISTS "status"    "EvidenceItemStatus" NOT NULL DEFAULT 'ACTIVE';

-- 4. Add contentsManifestDraft to Inspection
ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "contentsManifestDraft" TEXT;

-- 5. Index: submission gate + manifest queries
CREATE INDEX IF NOT EXISTS "EvidenceItem_inspectionId_status_idx"
  ON "EvidenceItem"("inspectionId", "status");
