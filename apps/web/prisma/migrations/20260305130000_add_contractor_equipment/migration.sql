-- CreateTable
CREATE TABLE "ContractorEquipment" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "category" TEXT NOT NULL,
    "lastCalibrated" TIMESTAMP(3),
    "calibrationDue" TIMESTAMP(3),
    "calibrationCertUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorEquipment_contractorId_idx" ON "ContractorEquipment"("contractorId");

-- CreateIndex
CREATE INDEX "ContractorEquipment_category_idx" ON "ContractorEquipment"("category");

-- CreateIndex
CREATE INDEX "ContractorEquipment_isVerified_idx" ON "ContractorEquipment"("isVerified");

-- CreateIndex
CREATE INDEX "ContractorEquipment_calibrationDue_idx" ON "ContractorEquipment"("calibrationDue");

-- AddForeignKey
ALTER TABLE "ContractorEquipment" ADD CONSTRAINT "ContractorEquipment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
