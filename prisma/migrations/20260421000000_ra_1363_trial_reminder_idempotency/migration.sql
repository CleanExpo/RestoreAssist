-- RA-1363: trial-reminder cron idempotency.
-- JSON shape: { "3-day": "<ISO>", "1-day": "<ISO>" }
-- Null until the first reminder fires for a user.
ALTER TABLE "User" ADD COLUMN "trialReminderSentAt" JSONB;
