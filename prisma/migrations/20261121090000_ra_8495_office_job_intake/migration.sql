-- RA-8495 (DRC S2): office "log a job" intake with a per-organisation job number.
-- Additive only: one new enum, one new table, nullable columns, one unique index.
-- No backfill: existing jobs keep a NULL job number.

CREATE TYPE "JobClientType" AS ENUM ('BUILDER', 'LOSS_ADJUSTER', 'CLIENT', 'INSURANCE_COMPANY', 'OTHER');

ALTER TABLE "Organization" ADD COLUMN "jobNumberPrefix" TEXT;

ALTER TABLE "Inspection"
  ADD COLUMN "jobNumber" TEXT,
  ADD COLUMN "jobNumberOrganizationId" TEXT,
  ADD COLUMN "policyNumber" TEXT,
  ADD COLUMN "clientType" "JobClientType",
  ADD COLUMN "insuredName" TEXT,
  ADD COLUMN "insuredPhone" TEXT,
  ADD COLUMN "insuredEmail" TEXT,
  ADD COLUMN "officeNotes" TEXT;

CREATE TABLE "OrganizationJobSequence" (
    "organizationId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationJobSequence_pkey" PRIMARY KEY ("organizationId")
);

-- Every existing row has NULL in both columns, so this unique index builds
-- without conflict, and NULLs never collide in Postgres.
CREATE UNIQUE INDEX "Inspection_jobNumberOrganizationId_jobNumber_key" ON "Inspection"("jobNumberOrganizationId", "jobNumber");

ALTER TABLE "OrganizationJobSequence" ADD CONSTRAINT "OrganizationJobSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_jobNumberOrganizationId_fkey" FOREIGN KEY ("jobNumberOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default-deny for the Supabase anon and authenticated roles, as every recent
-- table does. The app writes through its own server connection.
ALTER TABLE "OrganizationJobSequence" ENABLE ROW LEVEL SECURITY;
