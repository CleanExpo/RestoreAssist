-- Migration: add_product_tour_dismissed_at
-- RA-1238: in-app product tour — store dismissal/completion timestamp per user.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "productTourDismissedAt" TIMESTAMP(3);
