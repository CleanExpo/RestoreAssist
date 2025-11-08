-- CreateTable
CREATE TABLE "PricingStructure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minimalCalloutFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "administrationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masterTechnicianRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualifiedTechnicianRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourerRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masterAfterHoursWeekday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masterSaturday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masterSunday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualifiedAfterHoursWeekday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualifiedSaturday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualifiedSunday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourerAfterHoursWeekday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourerSaturday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourerSunday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dehumidifierLarge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dehumidifierMedium" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dehumidifierDesiccant" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airmoverAxial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airmoverCentrifugal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airmoverLayflat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "afdExtraLarge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "afdLarge500cfm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractionTruckMounted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractionElectric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thermalCameraClaimCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chemicalAntiMicrobial" DOUBLE PRECISION NOT NULL DEFAULT 1.50,
    "chemicalMouldRemediation" DOUBLE PRECISION NOT NULL DEFAULT 2.50,
    "chemicalBioHazard" DOUBLE PRECISION NOT NULL DEFAULT 4.50,
    "customLabourRates" TEXT,
    "customEquipmentRates" TEXT,
    "customChemicalRates" TEXT,
    "customMiscRates" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingStructure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingStructure_userId_key" ON "PricingStructure"("userId");

-- CreateIndex
CREATE INDEX "PricingStructure_userId_idx" ON "PricingStructure"("userId");

-- AddForeignKey
ALTER TABLE "PricingStructure" ADD CONSTRAINT "PricingStructure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
