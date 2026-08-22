-- RA-406 fix-forward: idempotently (re)create the InsurerProfile type, table, and
-- indexes. Migration 20260403000003_add_insurer_profile is recorded as applied in
-- prod, but its DDL silently no-op'd, so the table is MISSING. Declaring the model
-- in schema.prisma (#1243) made scripts/check-schema-drift.mjs fail every prod build,
-- which #1250 reverted. This re-introduces the schema model AND ships an additive,
-- idempotent migration so `prisma migrate deploy` materialises the table on deploy.
-- Definitions match 20260403000003 EXACTLY (columns/types/defaults). No destructive
-- statements. Safe to apply whether or not the table already exists.

-- Enum: guarded create (CREATE TYPE has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InsurerReportFormat') THEN
    CREATE TYPE "InsurerReportFormat" AS ENUM ('STANDARD', 'ENHANCED', 'FORENSIC', 'SCOPE_ONLY');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "InsurerProfile" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "InsurerProfile_slug_key" ON "InsurerProfile"("slug");
CREATE INDEX IF NOT EXISTS "InsurerProfile_slug_idx" ON "InsurerProfile"("slug");
CREATE INDEX IF NOT EXISTS "InsurerProfile_isActive_idx" ON "InsurerProfile"("isActive");
