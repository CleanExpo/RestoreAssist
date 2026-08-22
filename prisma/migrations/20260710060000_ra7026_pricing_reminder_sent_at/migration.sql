-- RA-7026: one-time pricing-setup nudge tracking.
-- Additive nullable column — non-locking, safe to apply on a live table.
ALTER TABLE "User" ADD COLUMN "pricingReminderSentAt" TIMESTAMP(3);
