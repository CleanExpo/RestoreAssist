-- AlterTable
ALTER TABLE "InspectionPhoto"
  ADD COLUMN "cocoaSha256" TEXT,
  ADD COLUMN "cocoaCapturedAtUtc" TIMESTAMP(3),
  ADD COLUMN "cocoaUserHash" TEXT,
  ADD COLUMN "cocoaDeviceHint" TEXT;
