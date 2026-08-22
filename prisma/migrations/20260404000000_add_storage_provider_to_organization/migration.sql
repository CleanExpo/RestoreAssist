-- Add pluggable storage provider support to Organization (RA-408)
-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('SUPABASE', 'S3', 'GCS', 'AZURE');

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "storageProvider" "StorageProviderType" NOT NULL DEFAULT 'SUPABASE',
  ADD COLUMN "storageBucketUrl" TEXT;
