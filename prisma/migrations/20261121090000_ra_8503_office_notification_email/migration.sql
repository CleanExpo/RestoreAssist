-- RA-8503: office inbox told when a technician submits a job visit.
-- Additive and nullable: existing organisations fall back to the owner's email.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "officeNotificationEmail" TEXT;
