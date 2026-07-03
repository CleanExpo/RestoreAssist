-- RA-6964: re-add ExternalClient.contactId
--
-- Migration 20260130072417_update_schema dropped this column (schema.prisma
-- had already lost the field before that migration was generated). Route
-- handlers kept writing `contactId` behind `as any` casts, which masked the
-- missing column at compile time: every write failed at runtime after the
-- Client row had already been created, so every re-import created a
-- duplicate Client instead of finding the existing link.
--
-- Additive only: nullable column + index, no data loss, no lock-risk.

-- AlterTable
ALTER TABLE "ExternalClient" ADD COLUMN "contactId" TEXT;

-- CreateIndex
CREATE INDEX "ExternalClient_contactId_idx" ON "ExternalClient"("contactId");
