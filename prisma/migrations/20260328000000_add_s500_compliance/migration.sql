-- S500:2025 Compliance Schema Additions
-- C4: MoistureMeter model (legally required instrument traceability)
-- H6: Vapor pressure & GPP fields on EnvironmentalData + ambient conditions on MoistureReading
-- H7: EMC fields on MoistureReading
-- H8: EquipmentDeployment model (equipment audit trail)

-- CreateTable: MoistureMeter
CREATE TABLE "MoistureMeter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "lastCalibrationDate" TIMESTAMP(3),
    "calibrationMethod" TEXT,
    "calibrationCertRef" TEXT,
    "calibrationExpiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EquipmentDeployment
CREATE TABLE "EquipmentDeployment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "deploymentLocation" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "operatingHours" DOUBLE PRECISION,
    "ampDraw" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentDeployment_pkey" PRIMARY KEY ("id")
);

-- AlterTable: MoistureReading — add C4, H6, H7 fields
ALTER TABLE "MoistureReading"
    ADD COLUMN "meterId" TEXT,
    ADD COLUMN "recordedBy" TEXT,
    ADD COLUMN "ambientTempC" DOUBLE PRECISION,
    ADD COLUMN "ambientRH" DOUBLE PRECISION,
    ADD COLUMN "materialType" TEXT,
    ADD COLUMN "emcTarget" DOUBLE PRECISION;

-- AlterTable: EnvironmentalData — add H6 fields
ALTER TABLE "EnvironmentalData"
    ADD COLUMN "vaporPressure" DOUBLE PRECISION,
    ADD COLUMN "grainsPerPound" DOUBLE PRECISION;

-- CreateIndex: MoistureMeter
CREATE INDEX "MoistureMeter_userId_idx" ON "MoistureMeter"("userId");
CREATE INDEX "MoistureMeter_serialNumber_idx" ON "MoistureMeter"("serialNumber");
CREATE INDEX "MoistureMeter_calibrationExpiryDate_idx" ON "MoistureMeter"("calibrationExpiryDate");

-- CreateIndex: EquipmentDeployment
CREATE INDEX "EquipmentDeployment_reportId_idx" ON "EquipmentDeployment"("reportId");
CREATE INDEX "EquipmentDeployment_userId_idx" ON "EquipmentDeployment"("userId");
CREATE INDEX "EquipmentDeployment_startTime_idx" ON "EquipmentDeployment"("startTime");

-- CreateIndex: MoistureReading.meterId
CREATE INDEX "MoistureReading_meterId_idx" ON "MoistureReading"("meterId");

-- AddForeignKey: MoistureMeter → User
ALTER TABLE "MoistureMeter" ADD CONSTRAINT "MoistureMeter_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EquipmentDeployment → Report
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EquipmentDeployment → User
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: MoistureReading → MoistureMeter (nullable)
ALTER TABLE "MoistureReading" ADD CONSTRAINT "MoistureReading_meterId_fkey"
    FOREIGN KEY ("meterId") REFERENCES "MoistureMeter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
