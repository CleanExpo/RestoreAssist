-- RA-7052: Live Teacher completeness before/after snapshot.
-- Additive nullable columns — non-locking, safe to apply on a live table.
ALTER TABLE "LiveTeacherSession" ADD COLUMN "startCompletionPct" INTEGER;
ALTER TABLE "LiveTeacherSession" ADD COLUMN "finalCompletionPct" INTEGER;
