-- Tenant data-plane baseline (read-shadow pilot).
--
-- Deployed per-tenant into the client's own database. Single-tenant: no
-- workspaceId column — the database is the tenant boundary. UserRef is a one-way
-- identity mirror synced from the control plane; Inspection is the shadowed row.

-- CreateTable
CREATE TABLE "UserRef" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "role" TEXT,

    CONSTRAINT "UserRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "technicianName" TEXT,
    "technicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_inspectionNumber_key" ON "Inspection"("inspectionNumber");

-- CreateIndex
CREATE INDEX "Inspection_technicianId_idx" ON "Inspection"("technicianId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "UserRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
