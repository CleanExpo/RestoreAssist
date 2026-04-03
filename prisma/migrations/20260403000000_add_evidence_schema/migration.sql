-- Sprint G: Evidence schema (RA-397)
-- Chain-of-custody evidence capture for IICRC S500:2025 compliance

-- Enums
CREATE TYPE "EvidenceClass" AS ENUM (
  'SITE_OVERVIEW',
  'DAMAGE_CLOSE_UP',
  'MOISTURE_READING',
  'THERMAL_IMAGE',
  'EQUIPMENT_PLACEMENT',
  'CONTAINMENT_SETUP',
  'AIR_QUALITY_READING',
  'MATERIAL_SAMPLE',
  'FLOOR_PLAN_ANNOTATION',
  'PROGRESS_PHOTO',
  'COMPLETION_PHOTO',
  'AFFECTED_CONTENTS',
  'STRUCTURAL_ASSESSMENT',
  'SAFETY_HAZARD',
  'UTILITY_STATUS',
  'ENVIRONMENTAL_CONDITION',
  'OTHER'
);

CREATE TYPE "EvidenceStatus" AS ENUM (
  'CAPTURED',
  'REVIEWED',
  'APPROVED',
  'FLAGGED',
  'REJECTED'
);

CREATE TYPE "MediaType" AS ENUM (
  'PHOTO',
  'VIDEO',
  'AUDIO',
  'NOTE',
  'READING',
  'SKETCH',
  'DOCUMENT'
);

CREATE TYPE "CustodyAction" AS ENUM (
  'CAPTURED',
  'UPLOADED',
  'REVIEWED',
  'ANNOTATED',
  'EXPORTED',
  'SHARED',
  'ARCHIVED',
  'DELETED'
);

-- EvidenceItem: primary evidence record with chain-of-custody
CREATE TABLE "EvidenceItem" (
  "id"               TEXT        NOT NULL,
  "inspectionId"     TEXT        NOT NULL,
  "evidenceClass"    "EvidenceClass" NOT NULL,
  "mediaType"        "MediaType"     NOT NULL,
  "status"           "EvidenceStatus" NOT NULL DEFAULT 'CAPTURED',
  "title"            TEXT,
  "description"      TEXT,
  "fileUrl"          TEXT,
  "fileName"         TEXT,
  "fileSizeMb"       DOUBLE PRECISION,
  "mimeType"         TEXT,
  "measurementValue" DOUBLE PRECISION,
  "measurementUnit"  TEXT,
  "instrumentType"   TEXT,
  "instrumentSerial" TEXT,
  "capturedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "latitude"         DOUBLE PRECISION,
  "longitude"        DOUBLE PRECISION,
  "floorLevel"       TEXT,
  "roomName"         TEXT,
  "zoneRef"          TEXT,
  "inspectionPhase"  TEXT,
  "iicrcStandard"    TEXT,
  "iicrcSection"     TEXT,
  "iicrcNote"        TEXT,
  "qualityScore"     INTEGER,
  "qaNote"           TEXT,
  "capturedById"     TEXT,
  "contentHash"      TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL,
  CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvidenceItem_inspectionId_idx"             ON "EvidenceItem"("inspectionId");
CREATE INDEX "EvidenceItem_evidenceClass_idx"            ON "EvidenceItem"("evidenceClass");
CREATE INDEX "EvidenceItem_status_idx"                   ON "EvidenceItem"("status");
CREATE INDEX "EvidenceItem_capturedAt_idx"               ON "EvidenceItem"("capturedAt");
CREATE INDEX "EvidenceItem_inspectionId_evidenceClass_idx" ON "EvidenceItem"("inspectionId", "evidenceClass");

ALTER TABLE "EvidenceItem"
  ADD CONSTRAINT "EvidenceItem_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CustodyEvent: tamper-evident audit trail for each evidence item
CREATE TABLE "CustodyEvent" (
  "id"             TEXT        NOT NULL,
  "evidenceItemId" TEXT        NOT NULL,
  "action"         "CustodyAction" NOT NULL,
  "actorId"        TEXT        NOT NULL,
  "actorName"      TEXT,
  "contentHash"    TEXT,
  "metadata"       TEXT,
  "ipAddress"      TEXT,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustodyEvent_evidenceItemId_idx" ON "CustodyEvent"("evidenceItemId");
CREATE INDEX "CustodyEvent_actorId_idx"         ON "CustodyEvent"("actorId");
CREATE INDEX "CustodyEvent_action_idx"          ON "CustodyEvent"("action");
CREATE INDEX "CustodyEvent_createdAt_idx"        ON "CustodyEvent"("createdAt");

ALTER TABLE "CustodyEvent"
  ADD CONSTRAINT "CustodyEvent_evidenceItemId_fkey"
  FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
