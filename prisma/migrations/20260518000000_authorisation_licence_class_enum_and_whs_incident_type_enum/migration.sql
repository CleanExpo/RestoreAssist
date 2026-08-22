-- Punch-list P1 #19 + #20 — step 1 of 2 (CLAUDE.md rule #16: two-step column rename).
-- Additive only. The free-text columns `Authorisation.subjectLicenceClass`
-- and `WHSIncident.incidentType` stay in place. The new enum columns are
-- NULLABLE so existing rows do not need backfilling for this PR. A future
-- PR will (1) backfill the enum columns from the free-text values, then
-- (2) drop the free-text columns.

-- P1 #19 — Authorisation.subjectLicenceClass -----------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthorisationLicenceClass') THEN
    CREATE TYPE "AuthorisationLicenceClass" AS ENUM (
      'OPEN',
      'PROVISIONAL',
      'RESTRICTED',
      'LEARNER',
      'PROBATIONARY',
      'HEAVY_VEHICLE',
      'MOTORCYCLE',
      'OTHER'
    );
  END IF;
END$$;

ALTER TABLE "Authorisation"
  ADD COLUMN IF NOT EXISTS "subjectLicenceClassEnum" "AuthorisationLicenceClass";

-- P1 #20 — WHSIncident.incidentType --------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WHSIncidentType') THEN
    CREATE TYPE "WHSIncidentType" AS ENUM (
      'NEAR_MISS',
      'FIRST_AID',
      'MEDICAL_TREATMENT',
      'LOST_TIME_INJURY',
      'NOTIFIABLE_INCIDENT',
      'PROPERTY_DAMAGE',
      'ENVIRONMENTAL',
      'BIOHAZARD',
      'OTHER'
    );
  END IF;
END$$;

ALTER TABLE "WHSIncident"
  ADD COLUMN IF NOT EXISTS "incidentTypeEnum" "WHSIncidentType";
