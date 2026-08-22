-- RA-261: NIR Phase 4 — Storm, Biohazard, Carpet data models

-- ─── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "StormEventType" AS ENUM ('STORM', 'CYCLONE', 'HAIL', 'DOWNBURST', 'TORNADO');

CREATE TYPE "DamagePenetration" AS ENUM ('SURFACE', 'PARTIAL', 'FULL');

CREATE TYPE "RoofMaterialType" AS ENUM ('COLORBOND', 'TERRACOTTA', 'SHINGLES', 'METAL', 'OTHER');

CREATE TYPE "BiohazardType" AS ENUM (
  'SEWAGE_CAT3', 'BLOOD', 'BODILY_FLUIDS', 'CRIME_SCENE', 'UNATTENDED_DEATH'
);

CREATE TYPE "PPELevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');

CREATE TYPE "CarpetFiberType" AS ENUM ('WOOL', 'NYLON', 'POLYESTER', 'POLYPROPYLENE', 'OTHER');

CREATE TYPE "CarpetPileType" AS ENUM ('CUT', 'LOOP', 'CUT_LOOP', 'FRIEZE');

CREATE TYPE "StainRemovalResult" AS ENUM ('COMPLETE', 'PARTIAL', 'UNSUCCESSFUL');

-- ─── StormDamageAssessment ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StormDamageAssessment" (
  "id"                       TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"             TEXT          NOT NULL UNIQUE,
  "bomEventReference"        TEXT,
  "windSpeedKmh"             DOUBLE PRECISION,
  "eventType"                "StormEventType",
  "eventTimestamp"           TIMESTAMPTZ,
  "roofMaterialType"         "RoofMaterialType",
  "roofDamageAreaM2"         DOUBLE PRECISION,
  "damagePenetration"        "DamagePenetration",
  "waterIngressPoints"       TEXT,
  "engineerClearanceRequired" BOOLEAN       NOT NULL DEFAULT FALSE,
  "emergencyTarpingCompleted" BOOLEAN       NOT NULL DEFAULT FALSE,
  "emergencyTarpingM2"       DOUBLE PRECISION,
  "emergencyTarpingTimestamp" TIMESTAMPTZ,
  "waterCategory"            "WaterCategory",
  "asbestosRiskFlag"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "StormDamageAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "StormDamageAssessment_inspectionId_idx"
  ON "StormDamageAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "StormDamageAssessment_eventType_idx"
  ON "StormDamageAssessment"("eventType");

-- ─── BiohazardAssessment ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BiohazardAssessment" (
  "id"                       TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"             TEXT          NOT NULL UNIQUE,
  "biohazardType"            "BiohazardType",
  "contaminationAreaM2"      DOUBLE PRECISION,
  "atpReadingPre"            DOUBLE PRECISION,
  "atpReadingPost"           DOUBLE PRECISION,
  "swmsCompleted"            BOOLEAN       NOT NULL DEFAULT FALSE,
  "ppeLevel"                 "PPELevel",
  "wasteDisposalManifestId"  TEXT,
  "disposalFacilityLicense"  TEXT,
  "disposalCertificateUrl"   TEXT,
  "createdAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "BiohazardAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "BiohazardAssessment_inspectionId_idx"
  ON "BiohazardAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "BiohazardAssessment_biohazardType_idx"
  ON "BiohazardAssessment"("biohazardType");

-- ─── CarpetRestorationAssessment ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CarpetRestorationAssessment" (
  "id"                              TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                    TEXT          NOT NULL UNIQUE,
  "fiberType"                       "CarpetFiberType",
  "pileType"                        "CarpetPileType",
  "backingType"                     TEXT,
  "standingWaterHours"              DOUBLE PRECISION,
  "extractionRateLitresPerHour"     DOUBLE PRECISION,
  "extractionPasses"                INTEGER,
  "residualMoisturePostExtraction"  DOUBLE PRECISION,
  "delaminationTestResult"          TEXT,
  "finalMoisturePercent"            DOUBLE PRECISION,
  "stainType"                       TEXT,
  "stainPH"                         DOUBLE PRECISION,
  "stainTreatmentProduct"           TEXT,
  "stainRemovalResult"              "StainRemovalResult",
  "restorationDecision"             TEXT,
  "createdAt"                       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "CarpetRestorationAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CarpetRestorationAssessment_inspectionId_idx"
  ON "CarpetRestorationAssessment"("inspectionId");
