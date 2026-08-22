-- RA-1255: record ToS + Privacy Policy acceptance for AU consumer law compliance.
-- Nullable so legacy rows stay valid; new signups always populate on register.

ALTER TABLE "User" ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);
