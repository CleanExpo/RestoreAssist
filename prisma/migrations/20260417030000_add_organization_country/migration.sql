-- RA-1120: Add country field to Organization for NZ locale support
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'AU';
