-- RA-6996 — reconcile schema.prisma with production (Supabase udooysjajglluvuxkijp).
--
-- Nine tables (Room, RoomAnnotation, BusinessProfile, EquipmentDeployment,
-- MobileInspection, MoistureMeter, PushToken, CustodyEvent, ClientInvite), four
-- enums (RoomType, AnnotationType, CustodyAction, InspectionLayout), and ~35
-- columns on existing tables were applied directly to prod by earlier,
-- unrecorded migrations and never landed in this repo — application code
-- reached them only through an untyped `(prisma as any)` cast. Every object
-- below was re-verified against information_schema / pg_catalog on 2026-07-05.
--
-- Additive + idempotent + deploy-safe: CREATE TYPE / CREATE TABLE / ADD COLUMN
-- / CREATE INDEX / ADD CONSTRAINT all guard with IF NOT EXISTS (or an
-- EXCEPTION-swallowing DO block for enums/constraints), so this is a no-op
-- replay on prod and a clean provision on a fresh database. Nothing is altered
-- or dropped. Enum labels, column types, nullability, defaults, FK rules,
-- unique indexes, and secondary indexes all mirror prod exactly.
--
-- EXCLUDED by design (not in this migration): HistoricalJob (shipped in
-- 20260705050000), XeroAccountCodeMapping.userId (founder decision pending),
-- User.interviewTier enum-vs-text (founder decision), all pgvector/tsvector
-- Unsupported columns, and the legacy lowercase ERP tables.

-- pgcrypto provides gen_random_bytes() (ClientInvite.token default) and
-- gen_random_uuid(). Present on prod; guarded here so a fresh DB (CI/new env)
-- provisions cleanly instead of failing with "function gen_random_bytes does not exist".
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "RoomType" AS ENUM (
    'MASTER_BEDROOM', 'BEDROOM', 'BATHROOM', 'ENSUITE', 'KITCHEN', 'LIVING_ROOM',
    'FAMILY_ROOM', 'DINING_ROOM', 'LAUNDRY', 'HALLWAY', 'GARAGE', 'ATTIC',
    'BASEMENT', 'CRAWL_SPACE', 'OFFICE', 'STUDY', 'OUTDOOR', 'ROOF_CAVITY',
    'SUBFLOOR', 'STAIRWELL', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AnnotationType" AS ENUM (
    'ARROW', 'CIRCLE', 'RECTANGLE', 'TEXT', 'FREEHAND', 'MEASUREMENT', 'DAMAGE_ZONE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CustodyAction" AS ENUM (
    'CAPTURED', 'UPLOADED', 'REVIEWED', 'ANNOTATED', 'EXPORTED', 'SHARED',
    'ARCHIVED', 'DELETED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "InspectionLayout" AS ENUM ('ROOM_FIRST', 'TIMELINE', 'QUICK_CAPTURE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Orphan tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Room" (
  "id"            TEXT NOT NULL,
  "inspectionId"  TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "type"          "RoomType" NOT NULL DEFAULT 'OTHER',
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "thumbnailUrl"  TEXT,
  "floorPlanData" TEXT,
  "length"        DOUBLE PRECISION,
  "width"         DOUBLE PRECISION,
  "height"        DOUBLE PRECISION,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RoomAnnotation" (
  "id"        TEXT NOT NULL,
  "roomId"    TEXT NOT NULL,
  "type"      "AnnotationType" NOT NULL,
  "data"      TEXT NOT NULL,
  "photoId"   TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BusinessProfile" (
  "id"                         TEXT NOT NULL,
  "userId"                     TEXT NOT NULL,
  "name"                       TEXT NOT NULL,
  "abn"                        TEXT,
  "logoUrl"                    TEXT,
  "address"                    TEXT,
  "phone"                      TEXT,
  "email"                      TEXT,
  "insuranceCertificateNumber" TEXT,
  "insuranceExpiry"            TIMESTAMP,
  "licenceNumber"              TEXT,
  "licenceClass"               TEXT,
  "licenceExpiry"              TIMESTAMP,
  "isDefault"                  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                  TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"                  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EquipmentDeployment" (
  "id"                 TEXT NOT NULL,
  "reportId"           TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "equipmentType"      TEXT NOT NULL,
  "manufacturer"       TEXT,
  "make"               TEXT,
  "model"              TEXT,
  "serialNumber"       TEXT,
  "deploymentLocation" TEXT,
  "startTime"          TIMESTAMP NOT NULL,
  "endTime"            TIMESTAMP,
  "operatingHours"     DOUBLE PRECISION,
  "runHours"           DOUBLE PRECISION,
  "ampDraw"            DOUBLE PRECISION,
  "notes"              TEXT,
  "mobileLocalId"      TEXT,
  "metadata"           JSONB DEFAULT '{}'::jsonb,
  "createdAt"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP NOT NULL,
  CONSTRAINT "EquipmentDeployment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MobileInspection" (
  "id"              TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "mobileLocalId"   TEXT NOT NULL,
  "jobId"           TEXT,
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "category"        TEXT,
  "damageClass"     TEXT,
  "propertyAddress" TEXT NOT NULL,
  "latitude"        DOUBLE PRECISION,
  "longitude"       DOUBLE PRECISION,
  "notes"           TEXT DEFAULT ''::text,
  "userId"          TEXT NOT NULL,
  "nirInspectionId" TEXT,
  "reportId"        TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "MobileInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MoistureMeter" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "manufacturer"          TEXT NOT NULL,
  "model"                 TEXT NOT NULL,
  "serialNumber"          TEXT NOT NULL,
  "lastCalibrationDate"   TIMESTAMP,
  "calibrationMethod"     TEXT,
  "calibrationCertRef"    TEXT,
  "calibrationExpiryDate" TIMESTAMP,
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP NOT NULL,
  CONSTRAINT "MoistureMeter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushToken" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "userId"      TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "platform"    TEXT NOT NULL,
  "deviceId"    TEXT NOT NULL,
  "deviceModel" TEXT,
  "isActive"    BOOLEAN DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustodyEvent" (
  "id"             TEXT NOT NULL,
  "evidenceItemId" TEXT NOT NULL,
  "action"         "CustodyAction" NOT NULL,
  "actorId"        TEXT NOT NULL,
  "actorName"      TEXT,
  "contentHash"    TEXT,
  "metadata"       TEXT,
  "ipAddress"      TEXT,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClientInvite" (
  "id"              TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "inspectionId"    TEXT NOT NULL,
  "clientEmail"     TEXT NOT NULL,
  "clientName"      TEXT,
  "token"           TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  "expiresAt"       TIMESTAMPTZ NOT NULL DEFAULT (now() + '30 days'::interval),
  "firstAccessedAt" TIMESTAMPTZ,
  "revokedAt"       TIMESTAMPTZ,
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ClientInvite_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Unique + secondary indexes on the orphan tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Room_inspectionId_idx" ON "Room" ("inspectionId");

CREATE INDEX IF NOT EXISTS "RoomAnnotation_roomId_idx" ON "RoomAnnotation" ("roomId");

CREATE INDEX IF NOT EXISTS "BusinessProfile_userId_idx" ON "BusinessProfile" ("userId");
CREATE INDEX IF NOT EXISTS "BusinessProfile_userId_isDefault_idx" ON "BusinessProfile" ("userId", "isDefault");

CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentDeployment_mobileLocalId_key" ON "EquipmentDeployment" ("mobileLocalId");
CREATE INDEX IF NOT EXISTS "EquipmentDeployment_reportId_idx" ON "EquipmentDeployment" ("reportId");
CREATE INDEX IF NOT EXISTS "EquipmentDeployment_userId_idx" ON "EquipmentDeployment" ("userId");
CREATE INDEX IF NOT EXISTS "EquipmentDeployment_startTime_idx" ON "EquipmentDeployment" ("startTime");
CREATE INDEX IF NOT EXISTS "EquipmentDeployment_mobileLocalId_idx" ON "EquipmentDeployment" ("mobileLocalId");

CREATE UNIQUE INDEX IF NOT EXISTS "MobileInspection_mobileLocalId_key" ON "MobileInspection" ("mobileLocalId");
CREATE INDEX IF NOT EXISTS "MobileInspection_jobId_idx" ON "MobileInspection" ("jobId");
CREATE INDEX IF NOT EXISTS "MobileInspection_status_idx" ON "MobileInspection" ("status");
CREATE INDEX IF NOT EXISTS "MobileInspection_userId_idx" ON "MobileInspection" ("userId");
CREATE INDEX IF NOT EXISTS "MobileInspection_mobileLocalId_idx" ON "MobileInspection" ("mobileLocalId");

CREATE INDEX IF NOT EXISTS "MoistureMeter_userId_idx" ON "MoistureMeter" ("userId");
CREATE INDEX IF NOT EXISTS "MoistureMeter_serialNumber_idx" ON "MoistureMeter" ("serialNumber");
CREATE INDEX IF NOT EXISTS "MoistureMeter_calibrationExpiryDate_idx" ON "MoistureMeter" ("calibrationExpiryDate");

CREATE UNIQUE INDEX IF NOT EXISTS "PushToken_userId_deviceId_key" ON "PushToken" ("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "PushToken_userId_idx" ON "PushToken" ("userId");
CREATE INDEX IF NOT EXISTS "PushToken_token_idx" ON "PushToken" ("token");
CREATE INDEX IF NOT EXISTS "PushToken_isActive_idx" ON "PushToken" ("isActive");

CREATE INDEX IF NOT EXISTS "CustodyEvent_evidenceItemId_idx" ON "CustodyEvent" ("evidenceItemId");
CREATE INDEX IF NOT EXISTS "CustodyEvent_actorId_idx" ON "CustodyEvent" ("actorId");
CREATE INDEX IF NOT EXISTS "CustodyEvent_action_idx" ON "CustodyEvent" ("action");
CREATE INDEX IF NOT EXISTS "CustodyEvent_createdAt_idx" ON "CustodyEvent" ("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ClientInvite_token_key" ON "ClientInvite" ("token");
CREATE INDEX IF NOT EXISTS "ClientInvite_inspectionId_idx" ON "ClientInvite" ("inspectionId");
CREATE INDEX IF NOT EXISTS "ClientInvite_clientEmail_idx" ON "ClientInvite" ("clientEmail");
CREATE INDEX IF NOT EXISTS "ClientInvite_token_idx" ON "ClientInvite" ("token");
CREATE INDEX IF NOT EXISTS "ClientInvite_expiresAt_idx" ON "ClientInvite" ("expiresAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- Drifted columns on existing tables (all nullable or NOT NULL WITH DEFAULT)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "isPassThrough" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "taxType" TEXT NOT NULL DEFAULT 'OUTPUT';
ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "xeroAccountCode" TEXT;

ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "isPassThrough" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "taxType" TEXT NOT NULL DEFAULT 'OUTPUT';
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "unit" TEXT;

ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "xeroAccountCode" TEXT;
ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "rateSource" TEXT;
ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "suggestedRate" DOUBLE PRECISION;
ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "roomId" TEXT;

ALTER TABLE "XeroAccountCodeMapping" ADD COLUMN IF NOT EXISTS "damageType" TEXT;

ALTER TABLE "AffectedArea" ADD COLUMN IF NOT EXISTS "roomId" TEXT;

ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "mobileLocalId" TEXT;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;

ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "mobileLocalId" TEXT;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "gpp" DOUBLE PRECISION;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "emc" DOUBLE PRECISION;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "grainsPerPound" DOUBLE PRECISION;
ALTER TABLE "EnvironmentalData" ADD COLUMN IF NOT EXISTS "vaporPressure" DOUBLE PRECISION;

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "businessProfileId" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeBusinessProfileId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inspectionLayout" "InspectionLayout" NOT NULL DEFAULT 'ROOM_FIRST';

ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "propertyCountry" TEXT NOT NULL DEFAULT 'AU';

ALTER TABLE "CompanyPricingConfig" ADD COLUMN IF NOT EXISTS "electricityRatePer24h" DOUBLE PRECISION DEFAULT 1.50;

-- Indexes backing the new roomId links on existing tables
CREATE INDEX IF NOT EXISTS "AffectedArea_roomId_idx" ON "AffectedArea" ("roomId");
CREATE INDEX IF NOT EXISTS "InspectionPhoto_roomId_idx" ON "InspectionPhoto" ("roomId");
CREATE INDEX IF NOT EXISTS "ScopeItem_roomId_idx" ON "ScopeItem" ("roomId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Foreign keys (guarded — match prod ON DELETE / ON UPDATE rules exactly)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Room_inspectionId_fkey') THEN
    ALTER TABLE "Room" ADD CONSTRAINT "Room_inspectionId_fkey"
      FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RoomAnnotation_roomId_fkey') THEN
    ALTER TABLE "RoomAnnotation" ADD CONSTRAINT "RoomAnnotation_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentDeployment_reportId_fkey') THEN
    ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentDeployment_userId_fkey') THEN
    ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileInspection_nirInspectionId_fkey') THEN
    ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_nirInspectionId_fkey"
      FOREIGN KEY ("nirInspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileInspection_reportId_fkey') THEN
    ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileInspection_userId_fkey') THEN
    ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MoistureMeter_userId_fkey') THEN
    ALTER TABLE "MoistureMeter" ADD CONSTRAINT "MoistureMeter_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushToken_userId_fkey') THEN
    ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustodyEvent_evidenceItemId_fkey') THEN
    ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_evidenceItemId_fkey"
      FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientInvite_inspectionId_fkey') THEN
    ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_inspectionId_fkey"
      FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientInvite_createdByUserId_fkey') THEN
    ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffectedArea_roomId_fkey') THEN
    ALTER TABLE "AffectedArea" ADD CONSTRAINT "AffectedArea_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InspectionPhoto_roomId_fkey') THEN
    ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScopeItem_roomId_fkey') THEN
    ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
