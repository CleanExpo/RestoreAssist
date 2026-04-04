-- Migration: add_first_run_checklist
-- RA-390: First-run onboarding flow — store dismissal timestamp per user in DB

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstRunChecklistDismissedAt" TIMESTAMP(3);
