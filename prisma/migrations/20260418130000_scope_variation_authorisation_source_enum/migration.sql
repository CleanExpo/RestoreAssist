-- RA-1383 v2 (Board M-7 item 2): ScopeVariation.authorisationSource
-- Convert free-form TEXT to AuthorisationSource enum.
--
-- Production data safety: existing values are the 4 lowercase strings
-- validated by app/api/inspections/[id]/scope-variations/route.ts
-- (VALID_AUTHORISATION_SOURCES). Migration UPPERCASES each to the matching
-- enum value.

-- 1) Create the enum
CREATE TYPE "AuthorisationSource" AS ENUM (
  'INSURER_EMAIL',
  'CUSTOMER_SIGNATURE',
  'INTERNAL_MANAGER',
  'ADJUSTER_APPROVAL',
  'CARRIER_EMAIL',
  'CARRIER_PORTAL',
  'DOCUSIGN',
  'PHONE_THEN_EMAIL_FOLLOWUP',
  'EMERGENCY_SELF'
);

-- 2) Normalise existing data to the enum label form
UPDATE "ScopeVariation"
SET "authorisationSource" = UPPER("authorisationSource")
WHERE "authorisationSource" IN (
  'insurer_email',
  'customer_signature',
  'internal_manager',
  'adjuster_approval'
);

-- Safety net: any row with a value outside the expected set gets mapped to
-- INTERNAL_MANAGER (pre-existing free-form string that leaked through the
-- validator). This prevents migration failure on unexpected data. Rows that
-- were already correctly-cased or already an enum value will match the
-- USING cast below without needing this fallback.
UPDATE "ScopeVariation"
SET "authorisationSource" = 'INTERNAL_MANAGER'
WHERE "authorisationSource" NOT IN (
  'INSURER_EMAIL',
  'CUSTOMER_SIGNATURE',
  'INTERNAL_MANAGER',
  'ADJUSTER_APPROVAL',
  'CARRIER_EMAIL',
  'CARRIER_PORTAL',
  'DOCUSIGN',
  'PHONE_THEN_EMAIL_FOLLOWUP',
  'EMERGENCY_SELF'
);

-- 3) Alter column type — USING clause casts the now-normalised strings into
-- the enum. Safe because step 2 guarantees every value is in the enum set.
ALTER TABLE "ScopeVariation"
  ALTER COLUMN "authorisationSource" TYPE "AuthorisationSource"
  USING "authorisationSource"::text::"AuthorisationSource";
