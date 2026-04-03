-- RA-261: NIR Phase 5 — HVAC Assessment + Australian Compliance

-- ─── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "HVACContaminationLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'HEAVY');

CREATE TYPE "AustralianState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

CREATE TYPE "TechnicianCertification" AS ENUM (
  'WRT', 'ASD', 'CMS', 'HST', 'OCT', 'CCT', 'MRS', 'OTHER'
);

CREATE TYPE "NRPGCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'CATASTROPHIC');

-- ─── HVACAssessment ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "HVACAssessment" (
  "id"                          TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                TEXT          NOT NULL UNIQUE,
  "hvacSystemInspected"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "ductContaminationLevel"      "HVACContaminationLevel",
  "visibleSootInDucts"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "smokeOdourInDucts"           BOOLEAN       NOT NULL DEFAULT FALSE,
  "filterCondition"             TEXT,
  "coilContaminationLevel"      "HVACContaminationLevel",
  "hvacCleaningRequired"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "insulationResistanceMegaohm" DOUBLE PRECISION,
  "insulationTestPerformedBy"   TEXT,
  "createdAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "HVACAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HVACAssessment_inspectionId_idx"
  ON "HVACAssessment"("inspectionId");

-- ─── AustralianComplianceRecord ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AustralianComplianceRecord" (
  "id"                        TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"              TEXT          NOT NULL UNIQUE,
  "insurerName"               TEXT,
  "claimNumber"               TEXT,
  "lossAdjusterName"          TEXT,
  "lossAdjusterReference"     TEXT,
  "nrpgCategory"              "NRPGCategory",
  "iicrcCertifiedTechnician"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "technicianCertification"   "TechnicianCertification",
  "technicianLicenseNumber"   TEXT,
  "state"                     "AustralianState",
  "propertyYearBuilt"         INTEGER,
  "asbestosRiskAcknowledged"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "friableAssessment"         TEXT,
  "workHalted"                BOOLEAN       NOT NULL DEFAULT FALSE,
  "licensedAssessorName"      TEXT,
  "licensedAssessorLicense"   TEXT,
  "removalQuoteAud"           DECIMAL(10,2),
  "separateInvoiceRequired"   BOOLEAN       NOT NULL DEFAULT TRUE,
  "createdAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "AustralianComplianceRecord_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_inspectionId_idx"
  ON "AustralianComplianceRecord"("inspectionId");
CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_state_idx"
  ON "AustralianComplianceRecord"("state");
CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_nrpgCategory_idx"
  ON "AustralianComplianceRecord"("nrpgCategory");
