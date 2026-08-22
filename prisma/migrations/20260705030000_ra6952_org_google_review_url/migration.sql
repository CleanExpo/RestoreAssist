-- RA-6952 (epic RA-6948, Restoration Pulse P0) — review-ask at job close.
--
-- One change, additive + idempotent + deploy-safe (prisma migrate deploy):
--   Organization.googleReviewUrl — NEW nullable String column. The firm's
--   Google review link, surfaced by the founder-voice review-ask email fired
--   once per job on close. Null means the review-ask dispatcher suppresses
--   with reason NO_URL rather than sending a broken/missing link.
--
-- No existing table or column is altered or dropped. Nullable with no
-- DEFAULT, so the ADD COLUMN cannot fail on existing rows. IF NOT EXISTS
-- makes a replay a no-op (Postgres 12+).

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT;
