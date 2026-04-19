-- Migration: ra_1259_needs_onboarding
-- RA-1259: Google OAuth signups skip the account-type form. Flag brand-new
-- OAuth users with `needsOnboarding=true` and capture business fields
-- (ABN/ACN/state) on first dashboard visit via middleware redirect.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessACN" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessState" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "needsOnboarding" BOOLEAN NOT NULL DEFAULT false;
