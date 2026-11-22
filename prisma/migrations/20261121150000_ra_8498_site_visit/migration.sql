-- RA-8498 (DRC S5): site visit record.
--
-- Additive only: two new enums and one new table, with its indexes and
-- foreign keys. No existing table or column is changed. Reverse: down.sql in
-- this folder.
--
-- "SiteVisit_frontPhotoId_fkey" is ON DELETE NO ACTION on purpose: a photo in
-- use as a visit's front-of-property photo cannot be deleted on its own (the
-- two photo-delete routes refuse with 409 before they reach this backstop).
-- NO ACTION is checked at the end of the statement, so deleting the whole job
-- still cascades to both the photo and the visit.

-- CreateEnum
CREATE TYPE "SiteVisitPresence" AS ENUM ('OWNER', 'TENANT', 'CLIENT_SUPERVISOR', 'NO_ONE');

-- CreateEnum
CREATE TYPE "SiteVisitEquipmentOutcome" AS ENUM ('NONE_ON_SITE', 'ALL_LEFT', 'SOME_REMOVED', 'ALL_REMOVED');

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "visitNumber" INTEGER NOT NULL,
    "technicianId" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "metOnSite" "SiteVisitPresence",
    "frontPhotoId" TEXT,
    "equipmentOutcome" "SiteVisitEquipmentOutcome",
    "equipmentNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteVisit_frontPhotoId_idx" ON "SiteVisit"("frontPhotoId");

-- CreateIndex
CREATE INDEX "SiteVisit_technicianId_idx" ON "SiteVisit"("technicianId");

-- CreateIndex
CREATE INDEX "SiteVisit_submittedById_idx" ON "SiteVisit"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisit_inspectionId_visitNumber_key" ON "SiteVisit"("inspectionId", "visitNumber");

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_frontPhotoId_fkey" FOREIGN KEY ("frontPhotoId") REFERENCES "InspectionPhoto"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default-deny for the Supabase API roles, as every tenant table has; the app
-- reaches this table through Prisma as the table owner.
ALTER TABLE "SiteVisit" ENABLE ROW LEVEL SECURITY;
