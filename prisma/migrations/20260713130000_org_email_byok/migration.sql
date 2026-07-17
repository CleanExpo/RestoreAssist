-- SP-6 v1: Resend-only email BYOK on Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "emailProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "emailProviderEncryptedKey" TEXT,
  ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
