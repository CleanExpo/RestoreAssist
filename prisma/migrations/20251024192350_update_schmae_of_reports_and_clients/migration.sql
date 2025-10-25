-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "additionalCover" TEXT,
ADD COLUMN     "affectedArea" DOUBLE PRECISION,
ADD COLUMN     "airmoversCount" INTEGER,
ADD COLUMN     "businessInterruption" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "completionDate" TIMESTAMP(3),
ADD COLUMN     "containmentSetup" TEXT,
ADD COLUMN     "contentsCover" TEXT,
ADD COLUMN     "contentsDamage" TEXT,
ADD COLUMN     "decontaminationProcedures" TEXT,
ADD COLUMN     "dehumidificationCapacity" DOUBLE PRECISION,
ADD COLUMN     "dryingPlan" TEXT,
ADD COLUMN     "electricalHazards" TEXT,
ADD COLUMN     "equipmentPlacement" TEXT,
ADD COLUMN     "equipmentUsed" TEXT,
ADD COLUMN     "estimatedDryingTime" INTEGER,
ADD COLUMN     "hvacAffected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inspectionDate" TIMESTAMP(3),
ADD COLUMN     "liabilityCover" TEXT,
ADD COLUMN     "microbialGrowth" TEXT,
ADD COLUMN     "moistureReadings" TEXT,
ADD COLUMN     "postRemediationVerification" TEXT,
ADD COLUMN     "propertyCover" TEXT,
ADD COLUMN     "psychrometricReadings" TEXT,
ADD COLUMN     "reportNumber" TEXT,
ADD COLUMN     "safetyHazards" TEXT,
ADD COLUMN     "safetyPlan" TEXT,
ADD COLUMN     "sourceOfWater" TEXT,
ADD COLUMN     "structuralDamage" TEXT,
ADD COLUMN     "targetHumidity" DOUBLE PRECISION,
ADD COLUMN     "targetTemperature" DOUBLE PRECISION,
ADD COLUMN     "waterCategory" TEXT,
ADD COLUMN     "waterClass" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "company" TEXT,
    "contactPerson" TEXT,
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
