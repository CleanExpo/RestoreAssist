-- RA-261: NIR Full Data Depth — Phase 2: Fire/Smoke + Phase 3: Mould

-- ─── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "StructuralStability" AS ENUM ('SAFE', 'UNCERTAIN', 'COMPROMISED');

CREATE TYPE "SmokeResidueType" AS ENUM ('WET', 'DRY', 'PROTEIN', 'FUEL_OIL');

CREATE TYPE "OdourType" AS ENUM ('SMOKE', 'PROTEIN', 'CHEMICAL', 'FUEL');

CREATE TYPE "PackOutDecision" AS ENUM ('CLEAN_ONSITE', 'PACK_OUT', 'TOTAL_LOSS');

CREATE TYPE "ConditionGrade" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR');

CREATE TYPE "MouldConditionLevel" AS ENUM ('CONDITION_1', 'CONDITION_2', 'CONDITION_3');

-- ─── FireSmokeDamageAssessment ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FireSmokeDamageAssessment" (
  "id"                          TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                TEXT          NOT NULL UNIQUE,
  "structuralStability"         "StructuralStability",
  "electricalDisconnectVerified" BOOLEAN       NOT NULL DEFAULT FALSE,
  "gasShutoffVerified"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "charringDepthMm"             DOUBLE PRECISION,
  "engineerClearanceRequired"   BOOLEAN       NOT NULL DEFAULT FALSE,
  "smokeResidueType"            "SmokeResidueType",
  "residueLocation"             TEXT,
  "surfacePH"                   DOUBLE PRECISION,
  "pHMeterModel"                TEXT,
  "odourSeverityScore"          INTEGER,
  "hvacAffected"                BOOLEAN       NOT NULL DEFAULT FALSE,
  "odourType"                   "OdourType",
  "ozoneTreatmentDuration"      DOUBLE PRECISION,
  "ozoneConcentrationPpm"       DOUBLE PRECISION,
  "evacuationOrderTimestamp"    TIMESTAMPTZ,
  "reentryApprovalTimestamp"    TIMESTAMPTZ,
  "spaceVolumeM3"               DOUBLE PRECISION,
  "gateStructuralCleared"       BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateElectricalCleared"       BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "FireSmokeDamageAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "FireSmokeDamageAssessment_inspectionId_idx"
  ON "FireSmokeDamageAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "FireSmokeDamageAssessment_structuralStability_idx"
  ON "FireSmokeDamageAssessment"("structuralStability");

-- ─── ContentsPackOutItem ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ContentsPackOutItem" (
  "id"                      TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"            TEXT          NOT NULL,
  "itemDescription"         TEXT          NOT NULL,
  "make"                    TEXT,
  "model"                   TEXT,
  "serialNumber"            TEXT,
  "ageYears"                INTEGER,
  "conditionPreLoss"        "ConditionGrade",
  "conditionPostLoss"       "ConditionGrade",
  "replacementValueAud"     DECIMAL(10,2),
  "restorationCostEstimate" DECIMAL(10,2),
  "packOutDecision"         "PackOutDecision",
  "packOutTag"              TEXT,
  "beforePhotoUrl"          TEXT,
  "afterPhotoUrl"           TEXT,
  "claimType"               "ClaimType",
  "createdAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "ContentsPackOutItem_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_inspectionId_idx"
  ON "ContentsPackOutItem"("inspectionId");
CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_packOutDecision_idx"
  ON "ContentsPackOutItem"("packOutDecision");
CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_claimType_idx"
  ON "ContentsPackOutItem"("claimType");

-- ─── MouldRemediationAssessment ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MouldRemediationAssessment" (
  "id"                       TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"             TEXT          NOT NULL UNIQUE,
  "mouldConditionLevel"      "MouldConditionLevel",
  "visibleGrowthObserved"    BOOLEAN       NOT NULL DEFAULT FALSE,
  "affectedAreaM2"           DOUBLE PRECISION,
  "moistureSourceIdentified" BOOLEAN       NOT NULL DEFAULT FALSE,
  "rootCauseAddressed"       BOOLEAN       NOT NULL DEFAULT FALSE,
  "pressureDifferentialPa"   DOUBLE PRECISION,
  "airChangesPerHour"        DOUBLE PRECISION,
  "containmentBarrierMaterial" TEXT,
  "negativePressureMachineModel" TEXT,
  "airSamplingRequired"      BOOLEAN       NOT NULL DEFAULT FALSE,
  "samplingDate"             TIMESTAMPTZ,
  "labName"                  TEXT,
  "labReportReference"       TEXT,
  "sporeType"                TEXT,
  "sporeCountPreRemediation" DOUBLE PRECISION,
  "outdoorBaselineCount"     DOUBLE PRECISION,
  "sporeCountPostRemediation" DOUBLE PRECISION,
  "clearanceCriterion"       TEXT,
  "iepAssessmentRequired"    BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateMoistureSourceFixed"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateContainmentSufficient" BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "MouldRemediationAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MouldRemediationAssessment_inspectionId_idx"
  ON "MouldRemediationAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "MouldRemediationAssessment_mouldConditionLevel_idx"
  ON "MouldRemediationAssessment"("mouldConditionLevel");
