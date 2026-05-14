-- AlterEnum (additive: never drops existing values)
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'ONEDRIVE';
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'LOCAL';

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "storageProviderRefreshToken" TEXT,
  ADD COLUMN "storageProviderAccessToken" TEXT,
  ADD COLUMN "storageProviderTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "storageProviderAccountEmail" TEXT,
  ADD COLUMN "storageProviderPkceVerifier" TEXT;
