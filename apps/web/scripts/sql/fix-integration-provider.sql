-- Quick fix script to add the Integration.provider column
-- Run this if the migration hasn't been applied yet

-- First, create the enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationProvider') THEN
        CREATE TYPE "IntegrationProvider" AS ENUM ('XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA');
    END IF;
END $$;

-- Add provider column as nullable first
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "provider" "IntegrationProvider";

-- Update existing rows with a default provider based on name field
UPDATE "Integration" 
SET "provider" = CASE 
  WHEN LOWER("name") LIKE '%xero%' THEN 'XERO'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%quickbook%' OR LOWER("name") LIKE '%quick book%' THEN 'QUICKBOOKS'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%myob%' THEN 'MYOB'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%servicem8%' OR LOWER("name") LIKE '%service m8%' THEN 'SERVICEM8'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%ascora%' THEN 'ASCORA'::"IntegrationProvider"
  ELSE 'XERO'::"IntegrationProvider"
END
WHERE "provider" IS NULL;

-- Now make provider NOT NULL
ALTER TABLE "Integration" ALTER COLUMN "provider" SET NOT NULL;
