-- RA-405 schema correction: move contentsManifestDraft to Inspection table
-- (field was accidentally added to Report table in previous migration)
ALTER TABLE "Report" DROP COLUMN IF EXISTS "contentsManifestDraft";
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "contentsManifestDraft" JSONB;

-- RA-406: InsurerProfile — per-insurer evidence and reporting requirements
CREATE TYPE "InsurerReportFormat" AS ENUM ('STANDARD', 'ENHANCED', 'FORENSIC', 'SCOPE_ONLY');

CREATE TABLE "InsurerProfile" (
  "id"                       TEXT         NOT NULL,
  "slug"                     TEXT         NOT NULL,
  "name"                     TEXT         NOT NULL,
  "aliases"                  TEXT[]       NOT NULL DEFAULT '{}',
  "requiredEvidenceClasses"  TEXT[]       NOT NULL DEFAULT '{}',
  "preferredEvidenceClasses" TEXT[]       NOT NULL DEFAULT '{}',
  "minPhotoCount"            INTEGER      NOT NULL DEFAULT 5,
  "reportFormat"             "InsurerReportFormat" NOT NULL DEFAULT 'STANDARD',
  "requiresSignedScope"      BOOLEAN      NOT NULL DEFAULT false,
  "requiresThirdPartyScope"  BOOLEAN      NOT NULL DEFAULT false,
  "preferredInvoiceFormat"   TEXT,
  "gstRegistrationRequired"  BOOLEAN      NOT NULL DEFAULT true,
  "claimsEmailDomain"        TEXT,
  "portalUrl"                TEXT,
  "specialInstructions"      TEXT,
  "iicrcComplianceNote"      TEXT,
  "isActive"                 BOOLEAN      NOT NULL DEFAULT true,
  "isSystemProfile"          BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InsurerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsurerProfile_slug_key" ON "InsurerProfile"("slug");
CREATE INDEX "InsurerProfile_slug_idx" ON "InsurerProfile"("slug");
CREATE INDEX "InsurerProfile_isActive_idx" ON "InsurerProfile"("isActive");
